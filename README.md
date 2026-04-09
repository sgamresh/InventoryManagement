# InventoryManagement
Inventory Management

## Inventory Data Structure

- Category files are stored in `inventory/`:
  - `vegetables.json`
  - `fruits.json`
  - `dairy.json`
  - `grocery.json`
  - `household.json`
- Loader manifest is `inventory/index.json`.
- To add a new category:
  1. Create `inventory/<category-name>.json` with an array of items.
  2. Add that filename to the `files` array in `inventory/index.json`.
  3. (Optional) Add category label in `categoryOrder` inside `script.js` to control display order.
