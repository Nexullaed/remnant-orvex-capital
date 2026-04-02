import Link from "next/link";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import styles from "../styles/Home.module.css";

const contactDetails = [
  { label: "Email", value: "support@remnantorvexcapital.com" },
  { label: "Phone", value: "+265 123 456 789" },
  { label: "Address", value: "Mzuzu, Malawi" },
];

const highlights = [
  "Secure borrower and admin workflows",
  "Server-backed sessions with HttpOnly cookies",
  "Transparent balances, ledgers, and loan operations",
];

export default function HomePage() {
  const { user } = useContext(AuthContext);
  const primaryHref = user ? "/dashboard" : "/login";
  const primaryLabel = user ? "Open Dashboard" : "Let's Get Started";

  return (
    <div className={styles.page}>
      <div className={styles.glowA} aria-hidden="true" />
      <div className={styles.glowB} aria-hidden="true" />

      <header className={styles.topbar}>
        <div>
          <p className={styles.brand}>Remnant Orvex Capital</p>
          <p className={styles.tagline}>Professional fintech services with modern, secure client access.</p>
        </div>

        <nav className={styles.nav} aria-label="Primary">
          <a href="#about">About Us</a>
          <a href="#contacts">Contacts</a>
          <Link href={user ? "/dashboard" : "/login"}>{user ? "Dashboard" : "Sign In"}</Link>
        </nav>
      </header>

      <div className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>Trusted Financial Operations</span>
            <h1 className={styles.title}>Secure lending tools for borrowers, operators, and growing teams.</h1>
            <p className={styles.subtitle}>
              We build reliable financial workflows with clear account visibility, resilient security controls, and a polished experience that keeps every step professional.
            </p>

            <div className={styles.actions}>
              <Link className={styles.primaryButton} href={primaryHref}>
                {primaryLabel}
              </Link>
              <a className={styles.secondaryButton} href="#about">
                Learn More
              </a>
            </div>

            <ul className={styles.highlights}>
              {highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <aside className={styles.heroPanel}>
            <div className={styles.metric}>
              <span>Platform focus</span>
              <strong>Security-first lending</strong>
            </div>
            <div className={styles.metric}>
              <span>User experience</span>
              <strong>Clean, responsive workflows</strong>
            </div>
            <div className={styles.metric}>
              <span>Operational view</span>
              <strong>Borrower and admin dashboards</strong>
            </div>
          </aside>
        </section>

        <section className={styles.grid}>
          <article className={styles.card} id="about">
            <h2>About Us</h2>
            <p>
              Remnant Orvex Capital is built around dependable financial operations. We focus on secure account access, clear borrower journeys, and practical tools that help teams manage money with confidence.
            </p>
            <p>
              Our approach combines strong backend controls with a modern interface, so users get both safety and clarity without unnecessary friction.
            </p>
          </article>

          <article className={styles.card} id="contacts">
            <h2>Contacts</h2>
            <div className={styles.contactList}>
              {contactDetails.map((detail) => (
                <div className={styles.contactRow} key={detail.label}>
                  <span>{detail.label}</span>
                  <strong>{detail.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
