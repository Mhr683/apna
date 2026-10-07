export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateProductPayload(input: {
  name?: string;
  sku?: string;
  price?: number;
  stock?: number;
  category?: string;
}): ValidationResult {
  const errors: string[] = [];
  if (!input.name || typeof input.name !== 'string' || input.name.trim().length < 2) {
    errors.push('Product name must be at least 2 characters.');
  }
  if (input.name && input.name.length > 200) {
    errors.push('Product name cannot exceed 200 characters.');
  }
  if (input.sku !== undefined && input.sku.trim() !== '' && !/^[a-zA-Z0-9_-]+$/.test(input.sku.trim())) {
    errors.push('SKU must contain only alphanumeric characters, hyphens, or underscores.');
  }
  if (input.price === undefined || isNaN(Number(input.price)) || Number(input.price) <= 0) {
    errors.push('Price must be a valid positive number (> 0).');
  }
  if (input.stock !== undefined && (isNaN(Number(input.stock)) || Number(input.stock) < 0)) {
    errors.push('Stock quantity cannot be negative.');
  }
  if (!input.category || typeof input.category !== 'string' || input.category.trim().length === 0) {
    errors.push('Product category is required.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateCsvFileUpload(file: {
  name: string;
  size: number;
  type?: string;
}): ValidationResult {
  const errors: string[] = [];
  const maxBytes = 5 * 1024 * 1024; // 5MB max CSV upload
  if (!file.name.toLowerCase().endsWith('.csv')) {
    errors.push('File extension must be .csv');
  }
  if (file.size > maxBytes) {
    errors.push('CSV file exceeds maximum size limit of 5MB.');
  }
  if (file.size === 0) {
    errors.push('Uploaded CSV file is empty.');
  }
  return { valid: errors.length === 0, errors };
}

export function validateCouponPayload(input: {
  code?: string;
  type?: string;
  value?: number;
  minCartAmount?: number;
}): ValidationResult {
  const errors: string[] = [];
  if (!input.code || !/^[A-Z0-9_-]{2,40}$/.test(input.code.toUpperCase())) {
    errors.push('Coupon code must be 2–40 uppercase alphanumeric characters.');
  }
  if (!input.type || !['PERCENTAGE', 'FIXED', 'FREE_SHIPPING', 'BOGO'].includes(input.type)) {
    errors.push('Invalid coupon discount type.');
  }
  if (input.value === undefined || isNaN(Number(input.value)) || Number(input.value) < 0) {
    errors.push('Coupon value must be non-negative.');
  }
  if (input.type === 'PERCENTAGE' && Number(input.value) > 100) {
    errors.push('Percentage discount cannot exceed 100%.');
  }
  return { valid: errors.length === 0, errors };
}

// RFC-4180 Compliant CSV Line Parser with Formula Injection Sanitization
export function parseCsvLineRFC4180(line: string): { cells: string[]; malformedQuotes: boolean } {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(sanitizeCsvCell(current));
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(sanitizeCsvCell(current));
  return { cells, malformedQuotes: inQuotes };
}

export function sanitizeCsvCell(raw: string): string {
  let cleaned = raw.trim();
  // Strip dangerous spreadsheet formula prefixes (=, +, -, @) when followed by non-numeric text
  if (/^[=+\-@]/.test(cleaned) && isNaN(Number(cleaned))) {
    cleaned = cleaned.replace(/^[=+\-@]+/, '');
  }
  // Strip any script tags
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  return cleaned.trim();
}

export function validateAIToolArgs(
  toolName: string,
  args: Record<string, any>
): ValidationResult {
  const errors: string[] = [];
  switch (toolName) {
    case 'createProduct':
      return validateProductPayload({
        name: args.name,
        sku: args.sku,
        price: Number(args.price),
        stock: args.stock !== undefined ? Number(args.stock) : 15,
        category: args.category,
      });
    case 'updateProduct':
      if (!args.productIdOrName || String(args.productIdOrName).trim().length === 0) {
        errors.push('productIdOrName is required for updateProduct.');
      }
      if (args.price !== undefined && (isNaN(Number(args.price)) || Number(args.price) <= 0)) {
        errors.push('Updated price must be > 0.');
      }
      if (args.stock !== undefined && (isNaN(Number(args.stock)) || Number(args.stock) < 0)) {
        errors.push('Updated stock cannot be negative.');
      }
      break;
    case 'duplicateProduct':
    case 'deleteProduct':
    case 'generateProductImages':
      if (!args.productIdOrName || String(args.productIdOrName).trim().length === 0) {
        errors.push(`productIdOrName is required for ${toolName}.`);
      }
      break;
    case 'updateInventory':
      if (!args.productIdOrName || String(args.productIdOrName).trim().length === 0) {
        errors.push('productIdOrName is required for updateInventory.');
      }
      if (args.newStock === undefined || isNaN(Number(args.newStock)) || Number(args.newStock) < 0) {
        errors.push('newStock must be a non-negative integer (>= 0).');
      }
      break;
    case 'bulkUpdateCategoryPrices':
      if (!args.category || String(args.category).trim().length === 0) {
        errors.push('category is required for bulkUpdateCategoryPrices.');
      }
      if (
        args.percentageChange === undefined ||
        isNaN(Number(args.percentageChange)) ||
        Number(args.percentageChange) < -90 ||
        Number(args.percentageChange) > 500
      ) {
        errors.push('percentageChange must be between -90% and +500%.');
      }
      break;
    case 'createCoupon':
      return validateCouponPayload({
        code: args.code,
        type: args.type,
        value: Number(args.value),
        minCartAmount: args.minCartAmount !== undefined ? Number(args.minCartAmount) : 0,
      });
    case 'deleteCoupon':
      if (!args.code || String(args.code).trim().length === 0) {
        errors.push('Coupon code is required for deleteCoupon.');
      }
      break;
    case 'updateOrderStatus':
    case 'cancelOrder':
    case 'refundOrder':
      if (!args.orderNumberOrId || String(args.orderNumberOrId).trim().length === 0) {
        errors.push(`orderNumberOrId is required for ${toolName}.`);
      }
      break;
    case 'sendCustomerEmail':
      if (!args.toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(args.toEmail).trim())) {
        errors.push('A valid recipient email address (toEmail) is required.');
      }
      if (!args.subject || String(args.subject).trim().length === 0) {
        errors.push('Email subject is required.');
      }
      if (!args.message || String(args.message).trim().length === 0) {
        errors.push('Email message body is required.');
      }
      break;
  }
  return { valid: errors.length === 0, errors };
}
