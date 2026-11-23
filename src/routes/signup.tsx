import { createFileRoute } from "@tanstack/react-router";
import { AccountPage } from "@/components/relay/AccountPage";
import accountCss from "@/account.css?url";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ title: "Sign up for Relay" }],
    links: [{ rel: "stylesheet", href: accountCss }],
  }),
  component: () => <AccountPage mode="signup" />,
});
