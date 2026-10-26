//! Shrinks large captures before upload. Retina selections are often 2000+ px wide, which
//! adds upload time and tokens without helping recognition.

use std::io::Cursor;

use image::imageops::FilterType;
use image::{GenericImageView, ImageFormat};

/// Longest edge sent to the API (docs/desktop-v0.md §5.1).
pub const MAX_EDGE: u32 = 2000;

#[derive(Debug)]
pub struct Prepared {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub resized: bool,
}

/// Returns the PNG unchanged if it already fits within `max_edge`, otherwise a resized copy
/// with the same aspect ratio.
pub fn prepare_for_upload(png: Vec<u8>, max_edge: u32) -> Result<Prepared, image::ImageError> {
    let image = image::load_from_memory_with_format(&png, ImageFormat::Png)?;
    let (width, height) = image.dimensions();
    if width.max(height) <= max_edge {
        return Ok(Prepared {
            png,
            width,
            height,
            resized: false,
        });
    }

    // `resize` fits within the box while preserving the aspect ratio.
    let resized = image.resize(max_edge, max_edge, FilterType::Triangle);
    let (width, height) = resized.dimensions();
    let mut out = Vec::new();
    resized.write_to(&mut Cursor::new(&mut out), ImageFormat::Png)?;
    Ok(Prepared {
        png: out,
        width,
        height,
        resized: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, RgbaImage};

    fn png_of(width: u32, height: u32) -> Vec<u8> {
        let mut out = Vec::new();
        DynamicImage::ImageRgba8(RgbaImage::new(width, height))
            .write_to(&mut Cursor::new(&mut out), ImageFormat::Png)
            .unwrap();
        out
    }

    #[test]
    fn small_images_pass_through_untouched() {
        let png = png_of(640, 120);
        let prepared = prepare_for_upload(png.clone(), MAX_EDGE).unwrap();
        assert!(!prepared.resized);
        assert_eq!((prepared.width, prepared.height), (640, 120));
        assert_eq!(prepared.png, png);
    }

    #[test]
    fn large_images_shrink_to_the_max_edge_keeping_aspect() {
        let prepared = prepare_for_upload(png_of(2378, 818), MAX_EDGE).unwrap();
        assert!(prepared.resized);
        assert_eq!(prepared.width, 2000);
        assert_eq!(prepared.height, 688); // 818 * 2000 / 2378, rounded
    }

    #[test]
    fn tall_images_are_limited_by_height() {
        let prepared = prepare_for_upload(png_of(500, 4000), MAX_EDGE).unwrap();
        assert_eq!((prepared.width, prepared.height), (250, 2000));
    }

    #[test]
    fn non_png_bytes_are_an_error() {
        assert!(prepare_for_upload(b"not a png".to_vec(), MAX_EDGE).is_err());
    }
}
