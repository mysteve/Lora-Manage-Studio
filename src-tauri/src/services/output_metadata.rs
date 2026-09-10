use image::ImageDecoder;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    fs::File,
    io::BufReader,
    path::Path,
};

const LIMIT: usize = 8 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadata {
    width: u32,
    height: u32,
    text: BTreeMap<String, String>,
    // 数字转成字符串，避免 JavaScript 将 64 位随机种子舍入。
    prompt: Option<Value>,
}

fn preserve_numbers(value: &mut Value) {
    match value {
        Value::Number(n) => *value = Value::String(n.to_string()),
        Value::Array(items) => items.iter_mut().for_each(preserve_numbers),
        Value::Object(items) => items.values_mut().for_each(preserve_numbers),
        _ => {}
    }
}

fn insert(text: &mut BTreeMap<String, String>, key: String, value: String) -> Result<(), String> {
    if text.values().map(String::len).sum::<usize>() + value.len() > LIMIT {
        return Err("图片生成记录超过 8 MiB，无法展示".into());
    }
    text.insert(key, value);
    Ok(())
}

pub fn read(path: &Path) -> Result<ImageMetadata, String> {
    let mut text = BTreeMap::new();
    let reader = image::ImageReader::open(path)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|e| format!("无法读取图片信息：{e}"))?;
    let (width, height) = decoder.dimensions();
    if path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("png"))
    {
        let file = BufReader::new(File::open(path).map_err(|e| e.to_string())?);
        let mut decoder = png::Decoder::new_with_limits(file, png::Limits { bytes: LIMIT });
        decoder.set_ignore_text_chunk(false);
        let mut reader = decoder
            .read_info()
            .map_err(|e| format!("PNG 信息损坏：{e}"))?;
        // 读取 IDAT 后的文本块，不分配完整图片像素缓冲区。
        reader.finish().map_err(|e| format!("PNG 信息损坏：{e}"))?;
        for chunk in &reader.info().uncompressed_latin1_text {
            insert(&mut text, chunk.keyword.clone(), chunk.text.clone())?;
        }
        for mut chunk in reader.info().compressed_latin1_text.clone() {
            chunk
                .decompress_text_with_limit(LIMIT)
                .map_err(|e| e.to_string())?;
            insert(
                &mut text,
                chunk.keyword.clone(),
                chunk.get_text().map_err(|e| e.to_string())?,
            )?;
        }
        for mut chunk in reader.info().utf8_text.clone() {
            chunk
                .decompress_text_with_limit(LIMIT)
                .map_err(|e| e.to_string())?;
            insert(
                &mut text,
                chunk.keyword.clone(),
                chunk.get_text().map_err(|e| e.to_string())?,
            )?;
        }
    }
    if let Some(exif) = decoder
        .exif_metadata()
        .map_err(|e| format!("EXIF 信息损坏：{e}"))?
    {
        read_exif(&exif, &mut text)?;
    }
    let prompt = text
        .get("prompt")
        .and_then(|s| serde_json::from_str::<Value>(s).ok())
        .map(|mut value| {
            preserve_numbers(&mut value);
            value
        });
    Ok(ImageMetadata {
        width,
        height,
        text,
        prompt,
    })
}

// 只读取 ComfyUI 文本标签和常见 UserComment，不解析或执行任何工作流。
fn read_exif(bytes: &[u8], text: &mut BTreeMap<String, String>) -> Result<(), String> {
    if bytes.len() > LIMIT {
        return Err("EXIF 信息超过 8 MiB".into());
    }
    let data = bytes.strip_prefix(b"Exif\0\0").unwrap_or(bytes);
    let little = match data.get(..4) {
        Some(b"II\x2a\0") => true,
        Some(b"MM\0\x2a") => false,
        _ => return Err("无法识别图片的 EXIF 信息".into()),
    };
    let word = |offset: usize| -> Option<u16> {
        let value = data.get(offset..offset.checked_add(2)?)?.try_into().ok()?;
        Some(if little {
            u16::from_le_bytes(value)
        } else {
            u16::from_be_bytes(value)
        })
    };
    let long = |offset: usize| -> Option<usize> {
        let value = data.get(offset..offset.checked_add(4)?)?.try_into().ok()?;
        Some(if little {
            u32::from_le_bytes(value)
        } else {
            u32::from_be_bytes(value)
        } as usize)
    };
    let mut pending = vec![long(4).ok_or("EXIF 信息不完整")?];
    let mut visited = HashSet::new();
    while let Some(offset) = pending.pop() {
        if offset == 0 || !visited.insert(offset) {
            continue;
        }
        if visited.len() > 32 {
            return Err("EXIF 目录数量过多".into());
        }
        let count = word(offset).ok_or("EXIF 目录损坏")? as usize;
        for index in 0..count {
            let pos = offset + 2 + index * 12;
            let tag = word(pos).ok_or("EXIF 标签损坏")?;
            let kind = word(pos + 2).ok_or("EXIF 标签损坏")?;
            let size = long(pos + 4).ok_or("EXIF 标签损坏")?;
            if tag == 0x8769 {
                pending.push(long(pos + 8).ok_or("EXIF 目录损坏")?);
                continue;
            }
            if !matches!(kind, 1 | 2 | 7) {
                continue;
            }
            let start = if size <= 4 {
                pos + 8
            } else {
                long(pos + 8).ok_or("EXIF 文本损坏")?
            };
            let raw = data
                .get(start..start.checked_add(size).ok_or("EXIF 文本过长")?)
                .ok_or("EXIF 文本损坏")?;
            let value = if raw.starts_with(b"UNICODE\0") || tag == 0x9c9c {
                let raw = raw.strip_prefix(b"UNICODE\0").unwrap_or(raw);
                let little = if raw.starts_with(&[0xff, 0xfe]) {
                    true
                } else if raw.starts_with(&[0xfe, 0xff]) {
                    false
                } else {
                    little || tag == 0x9c9c
                };
                let raw = raw
                    .strip_prefix(&[0xff, 0xfe])
                    .or_else(|| raw.strip_prefix(&[0xfe, 0xff]))
                    .unwrap_or(raw);
                String::from_utf16_lossy(
                    &raw.chunks_exact(2)
                        .map(|c| {
                            if little {
                                u16::from_le_bytes([c[0], c[1]])
                            } else {
                                u16::from_be_bytes([c[0], c[1]])
                            }
                        })
                        .collect::<Vec<_>>(),
                )
            } else {
                String::from_utf8_lossy(raw.strip_prefix(b"ASCII\0\0\0").unwrap_or(raw))
                    .into_owned()
            };
            let value = value.trim_matches('\0');
            if let Some((key, content)) = value
                .split_once(':')
                .filter(|(key, _)| matches!(*key, "prompt" | "workflow" | "parameters"))
            {
                insert(text, key.into(), content.into())?;
            } else if matches!(tag, 0x9286 | 0x9c9c | 0x010e) && !value.is_empty() {
                insert(text, "parameters".into(), value.into())?;
            }
        }
        pending.push(long(offset + 2 + count * 12).ok_or("EXIF 目录不完整")?);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::ImageEncoder;

    fn comfy_exif() -> Vec<u8> {
        let value = b"prompt:{\"1\":{}}\0";
        let mut data = b"II\x2a\0\x08\0\0\0\x01\0\x10\x01\x02\0".to_vec();
        data.extend((value.len() as u32).to_le_bytes());
        data.extend(26u32.to_le_bytes());
        data.extend(0u32.to_le_bytes());
        data.extend(value);
        data
    }

    #[test]
    fn reads_metadata_from_real_jpeg_and_webp_containers() {
        let dir = tempfile::tempdir().unwrap();
        let jpeg = dir.path().join("result.jpg");
        let webp = dir.path().join("result.webp");
        let mut encoder = image::codecs::jpeg::JpegEncoder::new(File::create(&jpeg).unwrap());
        encoder.set_exif_metadata(comfy_exif()).unwrap();
        encoder
            .write_image(&[120, 120, 120], 1, 1, image::ExtendedColorType::Rgb8)
            .unwrap();
        let mut encoder =
            image::codecs::webp::WebPEncoder::new_lossless(File::create(&webp).unwrap());
        encoder.set_exif_metadata(comfy_exif()).unwrap();
        encoder
            .write_image(&[120, 120, 120], 1, 1, image::ExtendedColorType::Rgb8)
            .unwrap();
        for path in [&jpeg, &webp] {
            let metadata = read(path).unwrap();
            assert_eq!(metadata.text["prompt"], "{\"1\":{}}");
            assert_eq!((metadata.width, metadata.height), (1, 1));
        }
    }
    #[test]
    fn reads_png_text_and_preserves_seed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("result.png");
        let mut encoder = png::Encoder::new(File::create(&path).unwrap(), 1, 1);
        encoder
            .add_text_chunk(
                "prompt".into(),
                r#"{"3":{"inputs":{"seed":18446744073709551615}}}"#.into(),
            )
            .unwrap();
        encoder
            .add_ztxt_chunk("parameters".into(), "Steps: 20".into())
            .unwrap();
        encoder
            .add_itxt_chunk("workflow".into(), "中文工作流".into())
            .unwrap();
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&[0]).unwrap();
        writer
            .write_text_chunk(&png::text_metadata::TEXtChunk::new("after", "after IDAT"))
            .unwrap();
        writer.finish().unwrap();
        let result = read(&path).unwrap();
        assert_eq!(result.width, 1);
        assert_eq!(result.text["workflow"], "中文工作流");
        assert_eq!(result.text["parameters"], "Steps: 20");
        assert_eq!(result.text["after"], "after IDAT");
        assert_eq!(
            result.prompt.unwrap()["3"]["inputs"]["seed"],
            "18446744073709551615"
        );
    }
    #[test]
    fn missing_metadata_and_broken_image_are_distinct() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("plain.png");
        image::GrayImage::new(1, 1).save(&path).unwrap();
        assert!(read(&path).unwrap().text.is_empty());
        std::fs::write(&path, "broken").unwrap();
        assert!(read(&path).is_err());
    }
    #[test]
    fn reads_comfy_exif_and_rejects_bad_offsets() {
        let mut data = comfy_exif();
        let mut text = BTreeMap::new();
        read_exif(&data, &mut text).unwrap();
        assert_eq!(text["prompt"], "{\"1\":{}}");
        data[18..22].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(read_exif(&data, &mut text).is_err());
    }
}
