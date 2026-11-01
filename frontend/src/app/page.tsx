import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

export const metadata: Metadata = {
  title: { absolute: "捷淞国际物流 · 进出口业务管理系统" },
  description:
    "捷淞国际物流进出口业务管理系统：报价、订单、采购、收货、发运、单证、发票与出口退税。",
};

export default function RootPage() {
  return <LandingPage />;
}
