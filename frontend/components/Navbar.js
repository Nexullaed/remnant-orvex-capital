import Link from "next/link";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../context/AuthContext";
import styles from "../styles/Navbar.module.css";

function linkClass(pathname, targetPath) {
  return pathname === targetPath ? `${styles.link} ${styles.linkActive}` : styles.link;
}

export default function Navbar() {
  const { logout, user } = useContext(AuthContext);
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [router.pathname]);

  function toggleMenu() {
    setIsOpen((current) => !current);
  }

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <nav className={styles.navbar} aria-label="Primary navigation">
      <div className={styles.logo}>
        <Link href="/" onClick={closeMenu}>
          Remnant Orvex Capital
        </Link>
      </div>

      <button
        aria-controls="primary-nav-links"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className={`${styles.menuButton} ${isOpen ? styles.menuButtonOpen : ""}`}
        onClick={toggleMenu}
        type="button"
      >
        <span className={styles.bar}></span>
        <span className={styles.bar}></span>
        <span className={styles.bar}></span>
      </button>

      <ul className={`${styles.navLinks} ${isOpen ? styles.navLinksOpen : ""}`} id="primary-nav-links">
        <li>
          <Link className={linkClass(router.pathname, "/")} href="/" onClick={closeMenu}>
            Home
          </Link>
        </li>
        {!user ? (
          <>
            <li>
              <Link className={linkClass(router.pathname, "/login")} href="/login" onClick={closeMenu}>
                Login
              </Link>
            </li>
            <li>
              <Link className={linkClass(router.pathname, "/register")} href="/register" onClick={closeMenu}>
                Register
              </Link>
            </li>
          </>
        ) : null}
        <li>
          <Link className={linkClass(router.pathname, "/dashboard")} href="/dashboard" onClick={closeMenu}>
            Dashboard
          </Link>
        </li>
        {user ? (
          <li>
            <button
              className={styles.logoutButton}
              onClick={() => {
                closeMenu();
                logout();
              }}
              type="button"
            >
              Sign Out
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
