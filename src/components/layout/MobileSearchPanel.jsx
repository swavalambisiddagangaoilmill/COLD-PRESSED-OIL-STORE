import { SlidersHorizontal, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getCategories, getProducts } from "../../services/catalogService.js";
import { formatCurrency } from "../../utils/formatCurrency.js";
import SafeImage from "../common/SafeImage.jsx";
import WishlistToggle from "../features/product/WishlistToggle.jsx";

const trending = ["Groundnut", "Sesame", "Coconut", "Mustard"];

export default function MobileSearchPanel({ open, query, onQueryChange, onClose }) {
  const [products, setProducts] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [categories, setCategories] = useState([{ name: "All" }]);
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("featured");
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = "hidden";
    Promise.all([
      getProducts({ limit: 4, sort: "featured" }),
      getCategories(),
    ]).then(([top, categoryItems]) => {
      setTopProducts(top.products);
      setCategories([{ name: "All" }, ...categoryItems]);
    }).catch(() => undefined);
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setProducts([]);
      setPagination(null);
      return undefined;
    }
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const categoryId = categories.find((item) => item.name === category)?.id;
      getProducts({
        limit: 20,
        search: query.trim(),
        category: category === "All" ? undefined : categoryId,
        sort: sort === "price-low" ? "priceAsc" : sort === "price-high" ? "priceDesc" : sort === "rating" ? "rating" : "featured",
      }).then((data) => {
        if (!active) return;
        setProducts(data.products);
        setPagination(data.pagination || null);
      }).catch(() => active && setProducts([])).finally(() => active && setLoading(false));
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [categories, category, open, query, sort]);

  const total = useMemo(() => pagination?.total ?? products.length, [pagination, products.length]);
  if (!open) return null;

  return (
    <section className="fixed inset-x-0 bottom-0 top-[147px] z-50 overflow-y-auto border-t border-ink/10 bg-white md:top-[169px] xl:top-[170px]" aria-label="Product search">
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
        {!query.trim() ? (
          <>
            <h2 className="text-sm font-semibold text-brand">Trending searches</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {trending.map((term) => <button key={term} type="button" onClick={() => onQueryChange(term)} className="rounded-md border border-ink/15 px-3 py-2 text-xs font-medium text-ink/75 hover:border-leaf hover:text-leaf">{term}</button>)}
            </div>
            {topProducts.length > 0 && (
              <div className="mt-8">
                <h2 className="border-b border-ink/10 pb-3 text-sm font-semibold text-brand">Top products</h2>
                <div className="divide-y divide-ink/10 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:divide-y-0">
                  {topProducts.map((product) => (
                    <Link key={product.id} to={`/product/${product.slug}`} onClick={onClose} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 py-3">
                      <SafeImage src={product.image} alt={product.name} className="aspect-square w-[72px] object-cover" />
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{product.name}</span><span className="mt-1 block text-xs text-ink/55">{formatCurrency(product.price)}</span></span>
                      <span className="text-xs font-semibold text-leaf">View</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-ink/15">
              <label className="flex h-11 items-center gap-2 border-r border-ink/15 px-3 text-xs font-semibold text-brand">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)} className="min-w-0 flex-1 bg-white text-xs outline-none"><option value="featured">Featured</option><option value="price-low">Price: low first</option><option value="price-high">Price: high first</option><option value="rating">Top rated</option></select></label>
              <label className="flex h-11 items-center gap-2 px-3 text-xs font-semibold text-brand"><SlidersHorizontal size={14} /><select value={category} onChange={(event) => setCategory(event.target.value)} className="min-w-0 flex-1 bg-white text-xs outline-none"><option value="All">Filters</option>{categories.slice(1).map((item) => <option key={item.id || item.name} value={item.name}>{item.name}</option>)}</select></label>
            </div>
            <p className="py-5 text-sm text-ink/65">{loading ? "Searching products..." : `${total} ${total === 1 ? "result" : "results"} found for “${query.trim()}”:`}</p>
            {!loading && <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {products.map((product) => (
                <article key={product.id} className="min-w-0 overflow-hidden rounded-md border border-ink/10 bg-white">
                  <div className="relative"><Link to={`/product/${product.slug}`} onClick={onClose}><SafeImage src={product.image} alt={product.name} className="aspect-square w-full object-cover" /></Link><WishlistToggle product={product} className="absolute right-2 top-2 h-9 w-9" size={16} /></div>
                  <div className="p-3"><Link to={`/product/${product.slug}`} onClick={onClose} className="block min-h-10 text-sm font-semibold leading-snug">{product.name}</Link><div className="mt-2 flex items-center gap-1 text-[11px] text-ink/50"><Star size={12} className="fill-leaf text-leaf" />{product.rating}</div><p className="mt-2 text-sm font-bold">{formatCurrency(product.price)}</p></div>
                </article>
              ))}
            </div>}
            {!loading && products.length === 0 && <p className="border-t border-ink/10 py-8 text-center text-sm text-ink/55">No products match this search.</p>}
          </>
        )}
      </div>
    </section>
  );
}
