//! Client for the Snip API's `POST /v1/recognize` (contract: docs/desktop-v0.md §5.2).

use std::fmt;
use std::time::Duration;

use serde::Deserialize;

/// Default for local development; configurable in M5. Override with `SNIP_API_URL`.
pub const DEFAULT_BASE_URL: &str = "http://127.0.0.1:8790";

/// Generous enough for the server's worst case (two models, one retry each).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Recognition {
    pub latex: String,
    pub engine: String,
    /// Server-side recognition time.
    pub ms: u64,
}

#[derive(Debug, PartialEq)]
pub enum ApiError {
    /// A documented error response, e.g. `no_math_found`.
    Server {
        status: u16,
        code: String,
    },
    /// Could not connect (server down, wrong URL, offline).
    Unreachable(String),
    Timeout,
    /// The server answered with something that isn't the documented contract.
    BadResponse(String),
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Server { status, code } => write!(f, "server returned {status} {code}"),
            Self::Unreachable(detail) => write!(f, "could not reach the API: {detail}"),
            Self::Timeout => write!(f, "the API did not answer in time"),
            Self::BadResponse(detail) => write!(f, "unexpected API response: {detail}"),
        }
    }
}

impl std::error::Error for ApiError {}

pub struct ApiClient {
    endpoint: String,
    agent: ureq::Agent,
}

impl ApiClient {
    pub fn new(base_url: &str) -> Self {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(REQUEST_TIMEOUT))
            // Read error bodies ourselves; they carry the error code.
            .http_status_as_error(false)
            .build()
            .into();
        Self {
            endpoint: format!("{}/v1/recognize", base_url.trim_end_matches('/')),
            agent,
        }
    }

    pub fn from_env() -> Self {
        Self::new(&std::env::var("SNIP_API_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string()))
    }

    pub fn recognize(&self, png: &[u8]) -> Result<Recognition, ApiError> {
        let mut response = self
            .agent
            .post(&self.endpoint)
            .header("Content-Type", "image/png")
            .send(png)
            .map_err(|error| match error {
                ureq::Error::Timeout(_) => ApiError::Timeout,
                other => ApiError::Unreachable(other.to_string()),
            })?;
        let status = response.status().as_u16();
        let body = response
            .body_mut()
            .read_to_string()
            .map_err(|error| ApiError::BadResponse(error.to_string()))?;
        parse_response(status, &body)
    }
}

#[derive(Deserialize)]
struct ErrorBody {
    error: String,
}

/// Interprets a response per the API contract. Separate from I/O so it can be unit-tested.
pub fn parse_response(status: u16, body: &str) -> Result<Recognition, ApiError> {
    if status == 200 {
        return serde_json::from_str(body)
            .map_err(|error| ApiError::BadResponse(error.to_string()));
    }
    match serde_json::from_str::<ErrorBody>(body) {
        Ok(error) => Err(ApiError::Server {
            status,
            code: error.error,
        }),
        Err(_) => Err(ApiError::BadResponse(format!(
            "status {status} without an error code"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_success() {
        let body = r#"{"latex":"x^2","engine":"gemini-3.5-flash-lite","ms":1180}"#;
        assert_eq!(
            parse_response(200, body),
            Ok(Recognition {
                latex: "x^2".into(),
                engine: "gemini-3.5-flash-lite".into(),
                ms: 1180
            })
        );
    }

    #[test]
    fn parses_documented_errors() {
        let body = r#"{"error":"no_math_found","message":"No equation found in the selection."}"#;
        assert_eq!(
            parse_response(422, body),
            Err(ApiError::Server {
                status: 422,
                code: "no_math_found".into()
            })
        );
    }

    #[test]
    fn rejects_bodies_outside_the_contract() {
        assert!(matches!(
            parse_response(200, "<html>"),
            Err(ApiError::BadResponse(_))
        ));
        assert!(matches!(
            parse_response(503, "Service Unavailable"),
            Err(ApiError::BadResponse(_))
        ));
    }

    /// End to end against a running API (`npm run dev:api`), through the same prepare and
    /// upload path the app uses. Opt-in:
    /// `SNIP_E2E_IMAGE=/path/to/equation.png cargo test e2e -- --ignored --nocapture`
    #[test]
    #[ignore = "needs a running API and SNIP_E2E_IMAGE"]
    fn e2e_recognizes_a_real_capture() {
        let path = std::env::var("SNIP_E2E_IMAGE").expect("set SNIP_E2E_IMAGE");
        let started = std::time::Instant::now();
        let prepared = crate::image_prep::prepare_for_upload(
            std::fs::read(path).unwrap(),
            crate::image_prep::MAX_EDGE,
        )
        .unwrap();
        let prepare_ms = started.elapsed().as_millis();
        let recognition = ApiClient::from_env().recognize(&prepared.png).unwrap();
        println!(
            "prepare {prepare_ms} ms ({}x{}, {} KB, resized={}), total {} ms, server {} ms, {}\n{}",
            prepared.width,
            prepared.height,
            prepared.png.len() / 1024,
            prepared.resized,
            started.elapsed().as_millis(),
            recognition.ms,
            recognition.engine,
            recognition.latex
        );
        assert!(!recognition.latex.is_empty());
    }

    #[test]
    fn builds_the_endpoint_from_the_base_url() {
        assert_eq!(
            ApiClient::new("http://127.0.0.1:8790/").endpoint,
            "http://127.0.0.1:8790/v1/recognize"
        );
    }
}
