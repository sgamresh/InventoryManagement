<?php
declare(strict_types=1);

header("Content-Type: application/json");

if (!isLocalRequest()) {
    respond(["success" => false, "error" => "This endpoint is available only on localhost."], 403);
}

if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
    respond(["success" => false, "error" => "Only POST requests are allowed."], 405);
}

$rawInput = file_get_contents("php://input");
$payload = decodeJsonToArray($rawInput ?: "");
if (!is_array($payload)) {
    respond(["success" => false, "error" => "Invalid JSON payload."], 400);
}

$action = (string)($payload["action"] ?? "");
if ($action === "update_price") {
    updatePrice($payload);
}
if ($action === "update_item") {
    updateItem($payload);
}
if ($action === "delete_item") {
    deleteItem($payload);
}
if ($action === "add_item") {
    addItem($payload);
}

respond(["success" => false, "error" => "Unsupported action."], 400);

function isLocalRequest(): bool
{
    $remote = $_SERVER["REMOTE_ADDR"] ?? "";
    return in_array($remote, ["127.0.0.1", "::1"], true);
}

function updatePrice(array $payload): void
{
    $itemId = trim((string)($payload["itemId"] ?? ""));
    $price = $payload["price"] ?? null;
    if ($itemId === "" || !is_numeric($price) || (float)$price < 0) {
        respond(["success" => false, "error" => "itemId and non-negative price are required."], 400);
    }

    $files = getIndexFiles();
    $numericPrice = round((float)$price, 2);

    foreach ($files as $file) {
        $items = loadItems($file);
        foreach ($items as $index => $item) {
            if (($item["id"] ?? "") !== $itemId) {
                continue;
            }
            $items[$index]["price"] = $numericPrice;
            writeItems($file, $items);
            rebuildMergedInventory();
            respond(["success" => true, "item" => $items[$index]]);
        }
    }

    respond(["success" => false, "error" => "Item not found."], 404);
}

function updateItem(array $payload): void
{
    $itemId = trim((string)($payload["itemId"] ?? ""));
    $name = trim((string)($payload["name"] ?? ""));
    $category = trim((string)($payload["category"] ?? ""));
    $unit = trim((string)($payload["unit"] ?? ""));
    $price = $payload["price"] ?? null;

    if ($itemId === "" || $name === "" || $category === "" || $unit === "" || !is_numeric($price) || (float)$price < 0) {
        respond(["success" => false, "error" => "itemId, name, category, unit and non-negative price are required."], 400);
    }

    $files = getIndexFiles();
    $sourceFile = null;
    $sourceItems = [];
    $sourceIndex = -1;
    $targetFile = null;
    $canonicalCategory = $category;
    $allIds = [];

    foreach ($files as $file) {
        $items = loadItems($file);
        foreach ($items as $idx => $item) {
            if (!empty($item["id"])) {
                $allIds[] = (string)$item["id"];
            }
            if (($item["id"] ?? "") === $itemId) {
                $sourceFile = $file;
                $sourceItems = $items;
                $sourceIndex = $idx;
            }
            if (strcasecmp((string)($item["category"] ?? ""), $category) === 0) {
                $targetFile = $file;
                $canonicalCategory = (string)$item["category"];
            }
        }
    }

    if ($sourceFile === null || $sourceIndex < 0) {
        respond(["success" => false, "error" => "Item not found."], 404);
    }

    if ($targetFile === null) {
        respond(["success" => false, "error" => "Category not found in inventory files."], 400);
    }

    $updatedItem = $sourceItems[$sourceIndex];
    $updatedItem["name"] = $name;
    $updatedItem["unit"] = $unit;
    $updatedItem["category"] = $canonicalCategory;
    $updatedItem["price"] = round((float)$price, 2);

    if ($sourceFile === $targetFile) {
        $sourceItems[$sourceIndex] = $updatedItem;
        writeItems($sourceFile, $sourceItems);
        rebuildMergedInventory();
        respond(["success" => true, "item" => $updatedItem]);
    }

    array_splice($sourceItems, $sourceIndex, 1);
    writeItems($sourceFile, $sourceItems);

    $targetItems = loadItems($targetFile);
    $targetItems[] = $updatedItem;
    writeItems($targetFile, $targetItems);

    rebuildMergedInventory();
    respond(["success" => true, "item" => $updatedItem]);
}

function addItem(array $payload): void
{
    $name = trim((string)($payload["name"] ?? ""));
    $category = trim((string)($payload["category"] ?? ""));
    $unit = trim((string)($payload["unit"] ?? ""));
    $price = $payload["price"] ?? null;

    if ($name === "" || $category === "" || $unit === "" || !is_numeric($price) || (float)$price < 0) {
        respond(["success" => false, "error" => "name, category, unit and a non-negative price are required."], 400);
    }

    $files = getIndexFiles();
    $targetFile = null;
    $canonicalCategory = $category;
    $allIds = [];

    foreach ($files as $file) {
        $items = loadItems($file);
        foreach ($items as $item) {
            if (!empty($item["id"])) {
                $allIds[] = (string)$item["id"];
            }
            if (strcasecmp((string)($item["category"] ?? ""), $category) === 0) {
                $targetFile = $file;
                $canonicalCategory = (string)$item["category"];
            }
        }
    }

    if ($targetFile === null) {
        respond(["success" => false, "error" => "Category not found in inventory files."], 400);
    }

    $newItemId = buildUniqueId($canonicalCategory, $name, $allIds);
    $newItem = [
        "id" => $newItemId,
        "name" => $name,
        "category" => $canonicalCategory,
        "unit" => $unit,
        "price" => round((float)$price, 2)
    ];

    $targetItems = loadItems($targetFile);
    $targetItems[] = $newItem;
    writeItems($targetFile, $targetItems);
    rebuildMergedInventory();

    respond(["success" => true, "item" => $newItem], 201);
}

function deleteItem(array $payload): void
{
    $itemId = trim((string)($payload["itemId"] ?? ""));
    if ($itemId === "") {
        respond(["success" => false, "error" => "itemId is required."], 400);
    }

    foreach (getIndexFiles() as $file) {
        $items = loadItems($file);
        foreach ($items as $index => $item) {
            if (($item["id"] ?? "") !== $itemId) {
                continue;
            }
            $deletedItem = $items[$index];
            array_splice($items, $index, 1);
            writeItems($file, $items);
            rebuildMergedInventory();
            respond(["success" => true, "item" => $deletedItem]);
        }
    }

    respond(["success" => false, "error" => "Item not found."], 404);
}

function buildUniqueId(string $category, string $name, array $existingIds): string
{
    $categorySlug = slugify($category);
    $nameSlug = slugify($name);
    $base = $categorySlug . "-" . $nameSlug;
    $candidate = $base;
    $suffix = 2;
    while (in_array($candidate, $existingIds, true)) {
        $candidate = $base . "-" . $suffix;
        $suffix++;
    }
    return $candidate;
}

function slugify(string $value): string
{
    $value = strtolower(trim($value));
    $value = preg_replace("/[^a-z0-9]+/", "-", $value) ?? "";
    return trim($value, "-");
}

function getIndexFiles(): array
{
    $indexPath = __DIR__ . DIRECTORY_SEPARATOR . "index.json";
    if (!is_file($indexPath)) {
        respond(["success" => false, "error" => "Missing inventory index file."], 500);
    }
    $parsed = decodeJsonToArray((string)file_get_contents($indexPath));
    if (!is_array($parsed) || !is_array($parsed["files"] ?? null)) {
        respond(["success" => false, "error" => "Invalid inventory index file format."], 500);
    }
    return array_values(array_filter($parsed["files"], static fn($name) => is_string($name) && $name !== ""));
}

function loadItems(string $file): array
{
    $path = __DIR__ . DIRECTORY_SEPARATOR . $file;
    if (!is_file($path)) {
        respond(["success" => false, "error" => "Missing inventory file: {$file}"], 500);
    }
    $parsed = decodeJsonToArray((string)file_get_contents($path));
    if (!is_array($parsed)) {
        respond(["success" => false, "error" => "Invalid JSON in {$file}"], 500);
    }
    return $parsed;
}

function decodeJsonToArray(string $json): ?array
{
    // Handle UTF-8 BOM that can break JSON parsing on some setups.
    $json = preg_replace('/^\xEF\xBB\xBF/', '', $json) ?? $json;
    $decoded = json_decode($json, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        return null;
    }
    return $decoded;
}

function writeItems(string $file, array $items): void
{
    $path = __DIR__ . DIRECTORY_SEPARATOR . $file;
    $encoded = json_encode($items, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        respond(["success" => false, "error" => "Unable to encode JSON for {$file}"], 500);
    }
    if (file_put_contents($path, $encoded . PHP_EOL, LOCK_EX) === false) {
        respond(["success" => false, "error" => "Unable to write inventory file: {$file}"], 500);
    }
}

function rebuildMergedInventory(): void
{
    $merged = [];
    foreach (getIndexFiles() as $file) {
        $merged = array_merge($merged, loadItems($file));
    }

    $legacyPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . "inventory.json";
    $encoded = json_encode($merged, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($encoded === false) {
        return;
    }
    file_put_contents($legacyPath, $encoded . PHP_EOL, LOCK_EX);
}

function respond(array $body, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}
