// Composes app-wide providers in one place.
import IntroLoader from "../components/features/feedback/IntroLoader.jsx";
import { ToastProvider } from "../components/features/feedback/ToastProvider.jsx";
import { AuthProvider } from "../context/AuthContext.jsx";
import { CartProvider } from "../context/CartContext.jsx";
import { PopupProvider } from "../context/PopupContext.jsx";
import { WishlistProvider } from "../context/WishlistContext.jsx";

export default function AppProviders({ children }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <WishlistProvider>
          <PopupProvider>
            <CartProvider>
              <IntroLoader>{children}</IntroLoader>
            </CartProvider>
          </PopupProvider>
        </WishlistProvider>
      </AuthProvider>
    </ToastProvider>
  );
}