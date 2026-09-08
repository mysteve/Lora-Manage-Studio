# LoRA Studio visual specification

Generated using the built-in ImageGen tool. Main library establishes the design; detail and discovery use it as image reference. Download image was regenerated with a text style reference after two image-edit service network failures. Its extraneous sidebar labels are not product requirements: all implemented pages use the library navigation.

- Canvas: 1600 × 1000 reference; minimum 1000 × 680; main verification at 1280 × 800.
- Background #101113; sidebar #161719; surface #1a1c1f; input #202226; border #303337.
- Accent #d7f580; primary text #f3f4f1; secondary #a2a6ad; muted #707680.
- Sidebar 248px (224px at compact widths); main padding 32px; card gap 18px; border radius 12px.
- System Segoe UI / Microsoft YaHei UI font, 14px body, 30px page title.
- Covers 4:3 with object-fit cover; 4 columns wide, 3 medium, 2 narrow. No invented model counts or connection status.
- Use real controls and lucide vector icons. Never render a full mockup as the UI. Generated sample covers are not actual Civitai metadata.
- Download statuses: queued, downloading, paused, verifying, completed, failed, cancelled.
- Preserve user edits and provide loading, empty, offline, error and long-title states.
