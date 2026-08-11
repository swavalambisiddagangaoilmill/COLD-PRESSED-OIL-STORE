export async function getActiveCarousel() {
  try {
    const response = await fetch("/carousel/manifest.json", { cache: "no-store" });
    if (!response.ok) return [];
    const items = await response.json();
    return items.map((item, index) => ({
      _id: `local-carousel-${item.file}`,
      title: item.title,
      imageUrl: `/carousel/${item.file}`,
      order: index + 1,
      isActive: true,
      provider: "local",
    }));
  } catch {
    return [];
  }
}
