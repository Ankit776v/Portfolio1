# ShopSphere Storefront Update

Shopify-inspired visual styling (not affiliated with Shopify), category tiles on the homepage, category filters in Shop, and category selection dropdowns in Seller and Admin product forms.

## Categories
Mobiles, Clothing, Electronics, Computers, Home & Kitchen, Beauty, Sports, Books, Accessories, Tech, Audio, Home, Lifestyle. The last four preserve compatibility with the existing starter catalog.

## Install
Replace application files from this archive, **but keep your existing `data/` directory** and any uploaded product images. Run `npm start`.

## Notes
The category dropdown constrains normal product creation in the browser; server-side category values are still accepted as strings for compatibility. Real production marketplaces should enforce a shared backend taxonomy and add migration rules. Existing checkout and upload behavior remain unchanged.
