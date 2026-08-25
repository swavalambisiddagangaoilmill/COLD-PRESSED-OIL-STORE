// Renders the Shop page experience.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Breadcrumb from "../components/common/Breadcrumb.jsx";
import ProductCard from "../components/features/product/ProductCard.jsx";
import Container from "../components/ui/Container.jsx";
import Input from "../components/ui/Input.jsx";
import SectionHeading from "../components/ui/SectionHeading.jsx";
import OfferBanner from "../components/features/feedback/OfferBanner.jsx";
import { getProducts } from "../services/catalogService.js";

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [sort, setSort] = useState("featured");
  const [search, setSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const searchInputRef = useRef(null);
  const invalidSearch = search.trim().length === 1;

  useEffect(() => {
    if (invalidSearch) return undefined;
    let active = true;
    const loadProducts = (showLoading = false) => {
      if (showLoading) setSearchLoading(true);
      return getProducts({
        all: true,
        search,
        sort:
          sort === "featured"
            ? "featured"
            : sort === "price-low"
              ? "priceAsc"
              : sort === "price-high"
                ? "priceDesc"
                : "newest",
      })
        .then((data) => {
          if (!active) return;
          setProducts(data.products);
        })
        .catch(() => active && setProducts([]))
        .finally(() => active && showLoading && setSearchLoading(false));
    };
    const timer = window.setTimeout(() => loadProducts(true), search ? 300 : 0);
    const refreshTimer = window.setInterval(() => loadProducts(false), 20000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(refreshTimer);
    };
  }, [invalidSearch, search, sort]);

  useEffect(() => {
    const nextSearch = searchParams.get("q") || "";
    setSearch((current) => (current === nextSearch ? current : nextSearch));
  }, [searchParams]);

  useEffect(() => {
    if (!location.state?.resetShop) return;
    setSort("featured");
    if (!searchParams.get("q")) setSearch("");
    navigate(
      {
        pathname: "/shop",
        search: searchParams.toString() ? `?${searchParams}` : "",
      },
      { replace: true, state: null },
    );
  }, [location.key]);

  useEffect(() => {
    if (searchParams.get("focus") === "search")
      window.setTimeout(() => searchInputRef.current?.focus(), 150);
  }, [searchParams]);

  const updateSearch = (value) => {
    setSearch(value);
    const nextParams = new URLSearchParams(searchParams);
    if (value) nextParams.set("q", value);
    else nextParams.delete("q");
    nextParams.set("focus", "search");
    setSearchParams(nextParams, { replace: true });
  };

  const visible = useMemo(
    () => products.filter(() => !invalidSearch),
    [invalidSearch, products],
  );
  return (
    <>
      <Breadcrumb items={[{ label: "Shop" }]} />
      <h1 className="sr-only">Shop cold pressed oils</h1>
      <section className="section-padding">
        <Container>
          <SectionHeading
            eyebrow="Shop oils"
            title="Cold pressed staples for every kitchen"
            text="Search products, compare variants, and add your pantry favourites in a few calm clicks."
          />
          <OfferBanner />
          <div className="mb-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px] lg:gap-4">
            <Input
              inputRef={searchInputRef}
              placeholder="Search oils"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
              aria-label="Search products"
              className="h-11 text-xs sm:h-[52px] sm:text-sm"
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-11 min-w-0 rounded-xl border border-ink/10 bg-white px-3 text-sm font-semibold outline-none sm:h-[52px] sm:px-4"
            >
              <option value="featured">Featured</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="rating">Top rated</option>
            </select>
          </div>
          {searchLoading && (
            <p className="mb-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-ink/60">
              Searching products...
            </p>
          )}
          {invalidSearch && (
            <p className="mb-5 rounded-2xl bg-linen p-4 text-sm font-semibold text-clay">
              Enter at least 2 characters to search.
            </p>
          )}
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {visible.length === 0 && !searchLoading && (
            <p className="rounded-3xl bg-white p-10 text-center text-ink/60">
              No oils match your search.
            </p>
          )}
        </Container>
      </section>
    </>
  );
}
