import { describe, test } from 'bun:test';
import { deepStrictEqual, match, strictEqual } from 'node:assert';
import {
  absoluteFeedUrl,
  buildMetaProductFeed,
  getAvailableStock,
  type MetaFeedProduct,
} from './feed.ts';

const product: MetaFeedProduct = {
  id: '3f2a1b04-7c6d-4e5f-8a9b-0c1d2e3f4a5b',
  name: 'Diamond Bit, Fine',
  sku: 'CADB003',
  description: 'Professional bit, gentle removal.',
  price_usd: 4.9,
  category: 'Nail Drill Bits',
  image_url: null,
  stock_on_hand: 8,
  stock_reserved: 3,
  variant_group: 'diamond-bits',
  product_images: [
    { image_url: 'https://cdn.example.com/second.jpg', display_order: 2 },
    { image_url: 'https://cdn.example.com/main.jpg', display_order: 1 },
  ],
};

describe('Meta automatic product feed', () => {
  test('uses a unique SKU as the searchable Meta item ID', () => {
    const feed = buildMetaProductFeed([product]);
    strictEqual(feed.itemCount, 1);
    match(feed.csv, /^id,title,description/);
    match(feed.csv, /"CADB003","Diamond Bit, Fine"/);
    match(feed.csv, /"diamond-bits","Nail Drill Bits"/);
  });

  test('uses the stored sale price without discounting it again', () => {
    const feed = buildMetaProductFeed([{ ...product, price_usd: 14 }]);
    match(feed.csv, /"14.00 USD"/);
    strictEqual(feed.csv.includes('9.80 USD'), false);
  });

  test('subtracts reserved stock and marks zero or negative availability out of stock', () => {
    strictEqual(getAvailableStock(product), 5);
    strictEqual(getAvailableStock({ ...product, stock_on_hand: 2 }), 0);
    const feed = buildMetaProductFeed([
      product,
      { ...product, id: 'other-id', sku: 'OUT1', stock_on_hand: 2 },
    ]);
    match(feed.csv, /"5","diamond-bits"/);
    match(feed.csv, /"out of stock","new"/);
  });

  test('keeps hidden categories and OhLaLa products sellable in the feed', () => {
    const feed = buildMetaProductFeed([
      { ...product, category: 'Abrasives' },
      { ...product, id: 'ohlala-id', sku: 'OH1', category: 'NÉRA x OhLaLa' },
    ]);
    strictEqual(feed.itemCount, 2);
    match(feed.csv, /"Abrasives"/);
    match(feed.csv, /"NÉRA x OhLaLa"/);
  });

  test('falls back to UUIDs when SKUs are absent or duplicated', () => {
    const feed = buildMetaProductFeed([
      product,
      { ...product, id: 'second-product-id' },
      { ...product, id: 'no-sku-id', sku: null },
    ]);
    match(feed.csv, /"3f2a1b04-7c6d-4e5f-8a9b-0c1d2e3f4a5b"/);
    match(feed.csv, /"second-product-id"/);
    match(feed.csv, /"no-sku-id"/);
    strictEqual(feed.csv.includes('"CADB003"'), false);
  });

  test('escapes spreadsheet punctuation and line breaks correctly', () => {
    const feed = buildMetaProductFeed([{
      ...product,
      name: 'Bit "Fine", Large',
      description: 'First line\nSecond line',
    }]);
    match(feed.csv, /"Bit ""Fine"", Large"/);
    match(feed.csv, /"First line Second line"/);
  });

  test('uses ordered product_images and original URLs rather than WebP rendering', () => {
    const feed = buildMetaProductFeed([product]);
    const mainPosition = feed.csv.indexOf('main.jpg');
    const secondPosition = feed.csv.indexOf('second.jpg');
    strictEqual(mainPosition > 0 && mainPosition < secondPosition, true);
    strictEqual(feed.csv.includes('render/image'), false);
    strictEqual(feed.csv.includes('format=webp'), false);
  });

  test('skips only products without a usable image', () => {
    const feed = buildMetaProductFeed([
      { ...product, product_images: [], image_url: null },
      { ...product, id: 'with-image', sku: 'IMG1' },
    ]);
    deepStrictEqual(
      { items: feed.itemCount, skipped: feed.skippedMissingImages },
      { items: 1, skipped: 1 },
    );
  });

  test('turns relative site images into absolute HTTP URLs', () => {
    strictEqual(
      absoluteFeedUrl('/images/product.jpg'),
      'https://nerabeautyus.com/images/product.jpg',
    );
    strictEqual(absoluteFeedUrl('javascript:alert(1)'), null);
  });
});
