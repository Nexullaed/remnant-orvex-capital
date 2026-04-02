import Link from "next/link";
import styles from "../styles/Footer.module.css";

const quickLinks = [
  { href: "/", label: "Home" },
  { href: "/login", label: "Login" },
  { href: "/apply", label: "Apply" },
  { href: "/dashboard", label: "Dashboard" },
];

const contactDetails = [
  { label: "Email", value: "support@remnantorvexcapital.com" },
  { label: "Phone", value: "+265 123 456 789" },
  { label: "Address", value: "Mzuzu, Malawi" },
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <div className={styles.section}>
          <p className={styles.eyebrow}>Quick Links</p>
          <h2>Stay connected to every part of the platform.</h2>

          <ul className={styles.linkList}>
            {quickLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.section}>
          <p className={styles.eyebrow}>Contact Us</p>
          <h2>Talk with our team in Mzuzu.</h2>

          <div className={styles.contactList}>
            {contactDetails.map((item) => (
              <div className={styles.contactRow} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.copy}>
        <p>Copyright {new Date().getFullYear()} Remnant Orvex Capital. All rights reserved.</p>
      </div>
    </footer>
  );
}
