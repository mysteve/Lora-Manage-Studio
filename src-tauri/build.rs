fn main() {
    println!("cargo:rerun-if-env-changed=LORA_STUDIO_OAUTH_CLIENT_ID");
    // 图标变化时重新生成 Windows 资源，避免开发模式复用旧图标。
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
