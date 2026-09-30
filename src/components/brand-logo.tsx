import Image from "next/image";

export function BrandLogo({ small = false }: { small?: boolean }) {
  return <span className={`brand-mark brand-mark-custom${small ? " brand-mark-small" : ""}`}>
    <Image src="/brand/climate-shelter-logo.png" alt="Logo Climate Shelter" width={48} height={48} className="brand-logo" priority />
  </span>;
}
