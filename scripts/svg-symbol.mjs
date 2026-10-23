export function svgToSymbol(svg, id) {
  const svgMatch = svg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!svgMatch) return '';
  const [, attrs, originalBody] = svgMatch;
  let body = originalBody;
  const localIds = [...body.matchAll(/\bid=(["'])(.*?)\1/g)].map((match) => match[2]);
  for (const localId of localIds) {
    const escaped = localId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scopedId = `${id}__${localId}`;
    body = body.replace(new RegExp(`(\\bid=["'])${escaped}(["'])`, 'g'), `$1${scopedId}$2`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${scopedId})`)
      .replace(new RegExp(`((?:xlink:)?href=["'])#${escaped}(["'])`, 'g'), `$1#${scopedId}$2`);
  }
  const dimension = (name) => {
    const value = attrs.match(new RegExp(`\\b${name}=(["'])([\\d.]+)(?:px)?\\1`, 'i'))?.[2];
    return Number(value) > 0 ? value : '24';
  };
  // SVGs without a viewBox still have their own drawing dimensions. Using a
  // universal 24px viewport clips larger Fearless artwork and warning icons.
  const viewBox = attrs.match(/\bviewBox=(["'])(.*?)\1/i)?.[2] ?? `0 0 ${dimension('width')} ${dimension('height')}`;
  return `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`;
}

export function wrapSvgSymbols(symbols) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${symbols.join('')}</svg>`;
}
