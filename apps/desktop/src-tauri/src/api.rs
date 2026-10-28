//! Client for the Snip API (contracts: docs/desktop-v0.md §5.2, docs/beta-v1.md §6 and §15).

use std::fmt;
use std::time::Duration;

use serde::Deserialize;

/// The hosted API (the `snip-api` Worker). Release builds use it.
pub const PRODUCTION_BASE_URL: &str = "https://api.snip.rojinsharma.com";
/// `npm run dev:api`. Debug builds use it.
pub const LOCAL_BASE_URL: &str = "http://127.0.0.1:8790";

/// Generous enough for the server's worst case (two models, one retry each).
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Recognition {
    pub latex: String,
    /// Missing from servers older than 0.6.0, which only returned math.
    #[serde(default)]
    pub kind: SnipKind,
    pub engine: String,
    /// Server-side recognition time.
    pub ms: u64,
}

/// `Math` is bare LaTeX, wrapped in the user's delimiters. `Text` is prose with `$…$` math,
/// pasted as is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnipKind {
    #[default]
    Math,
    Text,
}

#[derive(Debug, PartialEq)]
pub enum ApiError {
    /// A documented error response, e.g. `no_math_found`.
    Server {
        status: u16,
        code: String,
        /// When a `quota_exceeded` quota resets (ISO 8601), if the server said.
        resets_at: Option<String>,
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
            Self::Server { status, code, .. } => write!(f, "server returned {status} {code}"),
            Self::Unreachable(detail) => write!(f, "could not reach the API: {detail}"),
            Self::Timeout => write!(f, "the API did not answer in time"),
            Self::BadResponse(detail) => write!(f, "unexpected API response: {detail}"),
        }
    }
}

impl std::error::Error for ApiError {}

/// `GET /v1/me`: the key's quota and usage. All fields are null for the local API, which has
/// no keys or quotas.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub quota: Option<u64>,
    pub used: Option<u64>,
    pub resets_at: Option<String>,
}

/// `POST /v1/register`: a key of this install's own, so Snip works without an invite.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Registration {
    pub key: String,
}

pub struct ApiClient {
    base_url: String,
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
            base_url: base_url.trim_end_matches('/').to_string(),
            agent,
        }
    }

    /// `SNIP_API_URL` if set, otherwise the hosted API in release builds and the local one in
    /// debug builds.
    pub fn from_env() -> Self {
        let default = if cfg!(debug_assertions) {
            LOCAL_BASE_URL
        } else {
            PRODUCTION_BASE_URL
        };
        Self::new(&std::env::var("SNIP_API_URL").unwrap_or_else(|_| default.to_string()))
    }

    /// Sends the access key when there is one. The local API accepts requests without one;
    /// the hosted API answers 401 `invalid_key`.
    pub fn recognize(&self, png: &[u8], access_key: Option<&str>) -> Result<Recognition, ApiError> {
        let mut request = self
            .agent
            .post(&self.endpoint("recognize"))
            .header("Content-Type", "image/png");
        if let Some(key) = access_key {
            request = request.header("Authorization", &format!("Bearer {key}"));
        }
        let (status, body) = read(request.send(png))?;
        parse_response(status, &body)
    }

    /// Checks a key and reads its usage. Cheap: it never calls the recognizer.
    pub fn me(&self, access_key: Option<&str>) -> Result<Usage, ApiError> {
        let mut request = self.agent.get(&self.endpoint("me"));
        if let Some(key) = access_key {
            request = request.header("Authorization", &format!("Bearer {key}"));
        }
        let (status, body) = read(request.call())?;
        parse_json(status, &body)
    }

    /// Asks for a new key. Errors include `registration_limited` (too many from this network
    /// today) and `registration_closed` (switched off, or the local API).
    pub fn register(&self) -> Result<Registration, ApiError> {
        let (status, body) = read(self.agent.post(&self.endpoint("register")).send_empty())?;
        parse_json(status, &body)
    }

    fn endpoint(&self, name: &str) -> String {
        format!("{}/v1/{name}", self.base_url)
    }
}

fn read(
    response: Result<ureq::http::Response<ureq::Body>, ureq::Error>,
) -> Result<(u16, String), ApiError> {
    let mut response = response.map_err(|error| match error {
        ureq::Error::Timeout(_) => ApiError::Timeout,
        other => ApiError::Unreachable(other.to_string()),
    })?;
    let status = response.status().as_u16();
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|error| ApiError::BadResponse(error.to_string()))?;
    Ok((status, body))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ErrorBody {
    error: String,
    resets_at: Option<String>,
}

/// Interprets a `/v1/recognize` response per the API contract. Separate from I/O so it can
/// be unit-tested.
pub fn parse_response(status: u16, body: &str) -> Result<Recognition, ApiError> {
    parse_json(status, body)
}

fn parse_json<T: serde::de::DeserializeOwned>(status: u16, body: &str) -> Result<T, ApiError> {
    if (200..300).contains(&status) {
        return serde_json::from_str(body)
            .map_err(|error| ApiError::BadResponse(error.to_string()));
    }
    match serde_json::from_str::<ErrorBody>(body) {
        Ok(error) => Err(ApiError::Server {
            status,
            code: error.error,
            resets_at: error.resets_at,
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
                kind: SnipKind::Math,
                engine: "gemini-3.5-flash-lite".into(),
                ms: 1180
            })
        );
    }

    #[test]
    fn reads_the_kind_of_snip() {
        let body = r#"{"latex":"Roots are $x=1$.","kind":"text","engine":"lite","ms":900}"#;
        assert_eq!(parse_response(200, body).unwrap().kind, SnipKind::Text);
    }

    #[test]
    fn parses_documented_errors() {
        let body = r#"{"error":"no_math_found","message":"No equation found in the selection."}"#;
        assert_eq!(
            parse_response(422, body),
            Err(ApiError::Server {
                status: 422,
                code: "no_math_found".into(),
                resets_at: None,
            })
        );
    }

    #[test]
    fn keeps_the_reset_time_of_a_used_up_quota() {
        let body =
            r#"{"error":"quota_exceeded","message":"…","resetsAt":"2026-11-01T00:00:00.000Z"}"#;
        assert_eq!(
            parse_response(429, body),
            Err(ApiError::Server {
                status: 429,
                code: "quota_exceeded".into(),
                resets_at: Some("2026-11-01T00:00:00.000Z".into()),
            })
        );
    }

    #[test]
    fn parses_usage_for_hosted_and_local_apis() {
        let hosted = r#"{"quota":200,"used":37,"resetsAt":"2026-11-01T00:00:00.000Z"}"#;
        assert_eq!(
            parse_json::<Usage>(200, hosted),
            Ok(Usage {
                quota: Some(200),
                used: Some(37),
                resets_at: Some("2026-11-01T00:00:00.000Z".into()),
            })
        );
        let local = r#"{"quota":null,"used":null,"resetsAt":null}"#;
        assert_eq!(
            parse_json::<Usage>(200, local),
            Ok(Usage {
                quota: None,
                used: None,
                resets_at: None,
            })
        );
    }

    #[test]
    fn parses_a_registration_and_its_errors() {
        let created = r#"{"key":"snip_abcdefghijklmnopqrstuvwx23","quota":200,"used":0,"resetsAt":"2026-11-01T00:00:00.000Z"}"#;
        assert_eq!(
            parse_json::<Registration>(201, created),
            Ok(Registration {
                key: "snip_abcdefghijklmnopqrstuvwx23".into()
            })
        );
        let limited = r#"{"error":"registration_limited","message":"…"}"#;
        assert!(matches!(
            parse_json::<Registration>(429, limited),
            Err(ApiError::Server { status: 429, ref code, .. }) if code == "registration_limited"
        ));
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
        let key = std::env::var("SNIP_API_KEY").ok();
        let recognition = ApiClient::from_env()
            .recognize(&prepared.png, key.as_deref())
            .unwrap();
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
    fn builds_endpoints_from_the_base_url() {
        let client = ApiClient::new("http://127.0.0.1:8790/");
        assert_eq!(
            client.endpoint("recognize"),
            "http://127.0.0.1:8790/v1/recognize"
        );
        assert_eq!(client.endpoint("me"), "http://127.0.0.1:8790/v1/me");
        assert_eq!(
            client.endpoint("register"),
            "http://127.0.0.1:8790/v1/register"
        );
    }
}
