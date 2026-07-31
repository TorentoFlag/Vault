import { describe, expect, it } from "vitest";

import { parseCs2MetadataImages } from "./catalog-sync-cs2-images";

describe("parseCs2MetadataImages", () => {
  it("keeps only public HTTPS image URLs keyed by market hash name", () => {
    const images = parseCs2MetadataImages(JSON.stringify({
      "weapon-ak-redline": {
        id: "weapon-ak-redline",
        image: "https://community.akamai.steamstatic.com/economy/image/abc123",
        market_hash_name: "AK-47 | Redline (Field-Tested)",
      },
      "weapon-awp-asiimov": {
        id: "weapon-awp-asiimov",
        image: "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/default_generated/weapon_awp_cu_awp_asimov_light_png.png",
        market_hash_name: "AWP | Asiimov (Field-Tested)",
      },
      "blocked-sih": {
        id: "blocked-sih",
        image: "https://steaminventoryhelper.com/cdn-cgi/imagedelivery/MvHeJSvDbl13NYkuyvKbPw/weapons/dd9f12/public",
        market_hash_name: "Blocked SIH item",
      },
      "no-market-hash": {
        id: "no-market-hash",
        image: "https://community.akamai.steamstatic.com/economy/image/skip",
      },
    }));

    expect(images).toEqual([
      {
        imageUrl: "https://community.akamai.steamstatic.com/economy/image/abc123",
        marketHashName: "AK-47 | Redline (Field-Tested)",
      },
      {
        imageUrl: "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/main/static/panorama/images/econ/default_generated/weapon_awp_cu_awp_asimov_light_png.png",
        marketHashName: "AWP | Asiimov (Field-Tested)",
      },
    ]);
  });
});
