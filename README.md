# TMX Map Preview

Preview [Tiled Map Editor](https://www.mapeditor.org/) (`.tmx`) files directly in VS Code.

![preview](https://raw.githubusercontent.com/mortal-link/tmx/main/media/screenshot.png)

## Features

- **Canvas rendering** — Hardware-accelerated tile map rendering with pixel-perfect display
- **Layer controls** — Toggle individual layers on/off via toolbar buttons or number keys (1-9)
- **Zoom & pan** — Mouse wheel to zoom (toward cursor), drag to pan
- **Grid overlay** — Toggle tile grid with `G` key or toolbar button
- **Tile inspection** — Hover to see tile coordinates and GID values for each layer
- **Auto-reload** — Map updates automatically when the TMX file changes on disk
- **Tileset resolution** — Automatically finds tileset images relative to the TMX file, with fallback `.png`/`.jpg` extension matching
- **Flip support** — Correctly handles horizontal, vertical, and diagonal tile flips
- **Fallback rendering** — Shows colored placeholders when tileset images are missing

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `G` | Toggle grid |
| `0` | Fit map to window |
| `+` / `-` | Zoom in / out |
| `1`-`9` | Toggle layer visibility |

## Configuration

| Setting | Description |
|---------|-------------|
| `tmxPreview.tilesetSearchPaths` | Additional directories to search for tileset images (absolute or relative to the TMX file) |

## Tileset Image Resolution

The extension looks for tileset images in this order:

1. Path relative to the TMX file (as specified in the `<image source="...">` attribute)
2. Same path with `.png` / `.jpg` / `.bmp` extension appended
3. Directories listed in `tmxPreview.tilesetSearchPaths`
4. Workspace root folders

## Supported Format

- Tiled XML format (`.tmx`) with CSV-encoded tile data
- Orthogonal maps
- Multiple tilesets and layers

## License

MIT
