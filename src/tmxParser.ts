export interface TmxTileset {
  firstGid: number;
  name: string;
  tileWidth: number;
  tileHeight: number;
  tileCount: number;
  columns: number;
  imageSource: string;
  imageWidth: number;
  imageHeight: number;
}

export interface TmxLayer {
  id: number;
  name: string;
  width: number;
  height: number;
  visible: boolean;
  opacity: number;
  data: number[];
}

export interface TmxMap {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  tilesets: TmxTileset[];
  layers: TmxLayer[];
  properties: Record<string, string>;
}

export function parseTmx(xml: string): TmxMap {
  const map = parseTag(xml, 'map');
  if (!map) {
    throw new Error('Invalid TMX: no <map> element found');
  }

  const attrs = parseAttributes(map.attrs);
  const width = parseInt(attrs['width'] || '0');
  const height = parseInt(attrs['height'] || '0');
  const tileWidth = parseInt(attrs['tilewidth'] || '16');
  const tileHeight = parseInt(attrs['tileheight'] || '16');

  const tilesets = parseTilesets(map.content);
  const layers = parseLayers(map.content, width, height);
  const properties = parseProperties(map.content);

  return { width, height, tileWidth, tileHeight, tilesets, layers, properties };
}

function parseTilesets(xml: string): TmxTileset[] {
  const tilesets: TmxTileset[] = [];
  const regex = /<tileset\s+([^>]*)>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1]);
    const firstGid = parseInt(attrs['firstgid'] || '1');
    const name = attrs['name'] || '';
    const tileWidth = parseInt(attrs['tilewidth'] || '16');
    const tileHeight = parseInt(attrs['tileheight'] || '16');
    const tileCount = parseInt(attrs['tilecount'] || '0');
    const columns = parseInt(attrs['columns'] || '1');

    // Find the <image> tag within this tileset block
    const tilesetEnd = xml.indexOf('</tileset>', match.index);
    const tilesetBlock = tilesetEnd > 0
      ? xml.substring(match.index, tilesetEnd)
      : xml.substring(match.index, match.index + 2000);

    const imageMatch = /<image\s+([^>]*)\/?>/i.exec(tilesetBlock);
    let imageSource = '';
    let imageWidth = 0;
    let imageHeight = 0;

    if (imageMatch) {
      const imgAttrs = parseAttributes(imageMatch[1]);
      imageSource = imgAttrs['source'] || '';
      imageWidth = parseInt(imgAttrs['width'] || '0');
      imageHeight = parseInt(imgAttrs['height'] || '0');
    }

    tilesets.push({
      firstGid, name, tileWidth, tileHeight, tileCount, columns,
      imageSource, imageWidth, imageHeight,
    });
  }

  return tilesets;
}

function parseLayers(xml: string, defaultWidth: number, defaultHeight: number): TmxLayer[] {
  const layers: TmxLayer[] = [];
  // Match only tile layers (not objectgroup, imagelayer, etc.)
  const regex = /<layer\s+([^>]*)>([\s\S]*?)<\/layer>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const attrs = parseAttributes(match[1]);
    const layerContent = match[2];

    const id = parseInt(attrs['id'] || '0');
    const name = attrs['name'] || '';
    const width = parseInt(attrs['width'] || String(defaultWidth));
    const height = parseInt(attrs['height'] || String(defaultHeight));
    const visible = attrs['visible'] !== '0';
    const opacity = parseFloat(attrs['opacity'] || '1');

    const dataMatch = /<data\s+[^>]*encoding="csv"[^>]*>([\s\S]*?)<\/data>/i.exec(layerContent);
    let data: number[] = [];

    if (dataMatch) {
      data = dataMatch[1]
        .trim()
        .split(/[\s,]+/)
        .filter(s => s.length > 0)
        .map(s => parseInt(s));
    }

    layers.push({ id, name, width, height, visible, opacity, data });
  }

  return layers;
}

function parseProperties(xml: string): Record<string, string> {
  const props: Record<string, string> = {};
  // Only parse top-level properties (first <properties> block)
  const propsBlock = /<properties\s*>([\s\S]*?)<\/properties>/i.exec(xml);
  if (propsBlock) {
    const propRegex = /<property\s+([^>]*)\/?>/g;
    let match;
    while ((match = propRegex.exec(propsBlock[1])) !== null) {
      const attrs = parseAttributes(match[1]);
      const name = attrs['name'];
      const value = attrs['value'];
      if (name !== undefined && value !== undefined) {
        props[name] = value;
      }
    }
  }
  return props;
}

function parseTag(xml: string, tagName: string): { attrs: string; content: string } | null {
  const openRegex = new RegExp(`<${tagName}\\s+([^>]*)>`, 'i');
  const openMatch = openRegex.exec(xml);
  if (!openMatch) { return null; }

  const closeTag = `</${tagName}>`;
  const closeIndex = xml.lastIndexOf(closeTag);
  if (closeIndex < 0) { return null; }

  const contentStart = openMatch.index + openMatch[0].length;
  return {
    attrs: openMatch[1],
    content: xml.substring(contentStart, closeIndex),
  };
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /(\w+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}
