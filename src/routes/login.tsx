import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/components/relay/AccountPage";
import accountCss from "@/account.css?url";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign in to Relay" }],
    links: [{ rel: "stylesheet", href: accountCss }],
  }),
  component: () => <AccountPage mode="login" />,
});
