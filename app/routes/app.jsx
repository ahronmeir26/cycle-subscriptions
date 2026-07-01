import { Outlet, useLoaderData, useRouteError } from "react-router";
import { NavMenu } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const programId = url.searchParams.get("programId");

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || "",
    programId,
  };
};

export const meta = ({ data }) => [
  { name: "shopify-api-key", content: data?.apiKey ?? "" },
];

export default function App() {
  const { apiKey, programId } = useLoaderData();
  const query = programId ? `?programId=${encodeURIComponent(programId)}` : "";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <NavMenu>
        <a href={`/app${query}`}>Subscriptions</a>
        <a href={`/app/operations${query}`}>Operations</a>
        <a href={`/app/settings${query}`}>Reward rule</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
