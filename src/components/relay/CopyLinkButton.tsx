import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { roomUrl } from "@/lib/room-code";

export function CopyLinkButton({ code, label = "Copy invite link", ...props }: { code: string; label?: string } & ButtonProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = roomUrl(code, window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied", { description: url });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.message("Share this link", { description: url });
    }
  };
  return (
    <Button variant="secondary" onClick={copy} {...props}>
      {copied ? <Check /> : <Link2 />}
      {label}
    </Button>
  );
}
