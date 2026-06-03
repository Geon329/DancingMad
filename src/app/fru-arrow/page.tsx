import type { Metadata } from "next";
import { FruArrowSim } from "@/components/fru-arrow-sim";

export const metadata: Metadata = {
  title: "FRU Arrow Debuff Lab",
  description: "2D FRU arrow debuff simulator prototype"
};

export default function FruArrowPage() {
  return <FruArrowSim />;
}
