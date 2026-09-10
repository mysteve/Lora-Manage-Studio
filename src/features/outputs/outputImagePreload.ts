// Hold a bounded set of decoded neighbours; the browser may otherwise defer
// decoding until a full-size image becomes visible during navigation.
export function outputImagePreload(create: () => HTMLImageElement = () => new Image()) {
  const images = new Map<string, HTMLImageElement>();
  return {
    preload(src: string) {
      const existing = images.get(src);
      if (existing) {
        images.delete(src);
        images.set(src, existing);
        return;
      }
      const image = create();
      images.set(src, image);
      while (images.size > 6) images.delete(images.keys().next().value!);
      image.decoding = 'async';
      image.src = src;
      void image.decode().catch(() => {
        if (images.get(src) === image) images.delete(src);
      });
    },
    clear() { images.clear(); },
  };
}
