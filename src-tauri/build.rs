fn main() {
    println!("cargo:rerun-if-env-changed=LORA_STUDIO_OAUTH_CLIENT_ID");
    tauri_build::build()
}
