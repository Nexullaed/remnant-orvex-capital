import Layout from "../components/Layout";
import { AuthProvider } from "../context/AuthContext";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps }) {
  return (
    <AuthProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </AuthProvider>
  );
}
