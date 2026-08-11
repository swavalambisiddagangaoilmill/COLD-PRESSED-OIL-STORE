// Reusable Button UI primitive.
import { Link } from "react-router-dom";

const variants = {
  primary: "bg-ink text-white hover:bg-leaf",
  secondary: "bg-white text-ink hover:bg-linen",
  outline: "border border-ink/15 bg-transparent text-ink hover:border-leaf hover:text-leaf",
};

export default function Button({ children, to, type = "button", variant = "primary", className = "", loading = false, ...props }) {
  const classes = `inline-flex h-[52px] items-center justify-center gap-2 border border-transparent px-6 text-sm font-semibold transition duration-300 ${variants[variant]} ${className}`;
  const content = loading ? "Please wait" : children;

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} disabled={loading || props.disabled} {...props}>
      {content}
    </button>
  );
}


