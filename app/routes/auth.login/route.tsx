import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import styles from "../../styles/subscriptions.module.css";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post" className={styles.settingsForm}>
          <s-section heading="Log in">
            <label className={styles.field}>
              <span>Shop domain</span>
              <input
                aria-describedby={errors.shop ? "shop-error" : undefined}
                aria-invalid={Boolean(errors.shop)}
                autoComplete="on"
                name="shop"
                placeholder="example.myshopify.com"
              />
            </label>
            {errors.shop ? (
              <p className={styles.fieldError} id="shop-error">
                {errors.shop}
              </p>
            ) : null}
            <div className={styles.actionRow}>
              <button
                className={`${styles.button} ${styles.primaryButton}`}
                type="submit"
              >
                Log in
              </button>
            </div>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
