import { formatCurrency } from "../../../utils/formatCurrency.js";

export default function ProductPrice({ product, compact = false, className = "" }) {
  const finalPrice = Number(product?.effectivePrice ?? product?.price ?? 0);
  const originalPrice = Number(product?.mrp ?? finalPrice);
  const savings = Math.max(0, originalPrice - finalPrice);
  const percentage = savings > 0
    ? Number(product?.appliedOffer?.percentage) || Math.round((savings / originalPrice) * 100)
    : 0;

  return (
    <div className={`min-w-0 ${className}`}>
      <p className={`${compact ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl"} font-extrabold leading-none text-ink`}>{formatCurrency(finalPrice)}</p>
      {savings > 0 && (
        <>
          <div className={`mt-2 flex flex-wrap items-baseline ${compact ? "gap-1.5 text-xs" : "gap-2 text-sm sm:text-base"}`}>
            <span className="font-semibold text-ink/40 line-through">{formatCurrency(originalPrice)}</span>
            <span className="font-extrabold text-leaf">{percentage}% OFF</span>
          </div>
          <p className={`${compact ? "mt-1 text-xs" : "mt-1.5 text-sm"} font-bold text-leaf`}>Save {formatCurrency(savings)}</p>
        </>
      )}
    </div>
  );
}
