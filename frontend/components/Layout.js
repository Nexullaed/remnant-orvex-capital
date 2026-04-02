import Navbar from "./Navbar";
import Footer from "./Footer";

export default function Layout({ children }) {
  return (
    <div className="app-layout">
      <div className="app-chrome">
        <Navbar />
      </div>
      <main className="app-main">{children}</main>
      <Footer />
    </div>
  );
}
