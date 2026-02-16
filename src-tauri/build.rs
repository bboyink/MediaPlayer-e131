fn main() {
    // Windows-specific build configuration
    #[cfg(windows)]
    {
        // Set Windows subsystem to windows (no console) for release builds
        println!("cargo:rustc-link-arg=/SUBSYSTEM:WINDOWS");
        println!("cargo:rustc-link-arg=/ENTRY:mainCRTStartup");
    }
    
    tauri_build::build()
}
