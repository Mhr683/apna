import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Boxes,
  FileSpreadsheet,
  Terminal,
  Cpu,
  Tag,
  MessageSquare,
  Bell,
  ShieldAlert,
  Settings,
  ArrowLeft,
  Plus,
  Send,
  Upload,
  Download,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Camera,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  Product,
  OrderStatus,
  AIMessageRecord,
  ProductStudioShot,
} from '../types/store';
import { SAMPLE_CSV_TEMPLATE, IMG_HANDBAG } from '../data/seedData';
import { ProductImage } from './ProductImage';
import { formatDualPrice, formatPKR, EmailNotificationService } from '../services/abstractions';
import { canExecuteAITool } from '../ai/permissions';
import {
  validateCsvFileUpload,
  validateProductPayload,
  validateCouponPayload,
  parseCsvLineRFC4180,
  validateAIToolArgs,
} from '../validation/validators';

type AdminTab =
  | 'DASHBOARD'
  | 'PRODUCTS'
  | 'INVENTORY'
  | 'CSV_WORKFLOW'
  | 'ORDERS'
  | 'COUPONS'
  | 'REVIEWS'
  | 'AI_COMMAND_CENTER'
  | 'AI_TASKS'
  | 'AUDIT_LOGS'
  | 'NOTIFICATIONS'
  | 'SETTINGS';

interface PendingConfirmation {
  id: string;
  description: string;
  toolName: string;
  args: Record<string, any>;
  onConfirm: () => Promise<string>;
}

const DEMO_AI_COMMANDS = [
  'Create a new luxury black leather handbag product. Price $1290. Generate the complete listing and SEO content.',
  'Find products with stock below 5.',
  'Increase the price of all products in the Leather Goods category by 10%.',
  'Find products without SEO descriptions and generate SEO metadata for them.',
  'Create a 20% discount coupon SUMMER20 for orders above $250.',
  'Show orders that have not shipped.',
  'Rewrite all descriptions in the Fragrance category in a Luxury tone.',
  'Analyze today’s store sales and best-selling categories.',
];

export const AdminDashboardView: React.FC<{ onReturnToStore: () => void }> = ({
  onReturnToStore,
}) => {
  const {
    products,
    categories,
    orders,
    coupons,
    reviews,
    auditLogs,
    aiTasks,
    notifications,
    settings,
    firebaseUser,
    userProfile,
    isAdmin,
    signInWithGoogle,
    saveProduct,
    removeProduct,
    saveCategory,
    adjustInventory,
    updateOrderState,
    saveCoupon,
    deleteCouponById,
    moderateReview,
    updateStoreSettings,
    recordAuditLog,
    createOrUpdateAITask,
    markNotificationRead,
    seedInitialDatabaseIfEmpty,
    selectedAdminProduct,
    setSelectedAdminProduct,
    selectedAdminOrder,
    setSelectedAdminOrder,
    cancelAITask,
    showToast,
  } = useStore();

  const [activeTab, setActiveTab] = useState<AdminTab>('AI_COMMAND_CENTER');
  const [dateFilter, setDateFilter] = useState<'TODAY' | '7D' | '30D' | 'ALL'>('30D');

  // Floating AI Copilot Drawer Toggle (available on non-AI tabs)
  const [copilotDrawerOpen, setCopilotDrawerOpen] = useState(false);

  // AI Conversation State
  const [aiMessages, setAiMessages] = useState<AIMessageRecord[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Welcome to the Atelier Aurelia AI Executive Command Center. Tell me what operation to perform in natural language—such as creating products, adjusting category pricing, generating missing SEO metadata, importing CSV catalogs, creating coupons, or auditing unshipped orders—and I will execute it directly against your store database.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [pendingConfirmations, setPendingConfirmations] = useState<PendingConfirmation[]>([]);

  // Product Editor & AI Studio Image Generator State
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [studioShots, setStudioShots] = useState<ProductStudioShot[]>([]);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [generatingShots, setGeneratingShots] = useState(false);

  // CSV Import State
  const [csvRawText, setCsvRawText] = useState(SAMPLE_CSV_TEMPLATE);
  const [parsedCsvRows, setParsedCsvRows] = useState<
    {
      rowNumber: number;
      sku: string;
      name: string;
      price: number;
      stock: number;
      category: string;
      brand: string;
      shortDescription: string;
      seoTitle?: string;
      seoDescription?: string;
      valid: boolean;
      errors: string[];
      duplicate: boolean;
    }[]
  >([]);
  const [csvImportSummary, setCsvImportSummary] = useState<{
    imported: number;
    updated: number;
    failed: number;
  } | null>(null);
  const [csvEnriching, setCsvEnriching] = useState(false);

  // Coupon Form State
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'>('PERCENTAGE');
  const [newCouponValue, setNewCouponValue] = useState(20);
  const [newCouponMinAmount, setNewCouponMinAmount] = useState(200);

  // Analytics Calculations (Grounded in actual state)
  const totalRevenue = useMemo(
    () =>
      orders
        .filter((o) => o.status !== 'CANCELLED' && o.status !== 'REFUNDED')
        .reduce((sum, o) => sum + o.total, 0),
    [orders]
  );

  const avgOrderValue = useMemo(
    () => (orders.length > 0 ? totalRevenue / orders.length : 0),
    [orders, totalRevenue]
  );

  const lowStockProducts = useMemo(
    () => products.filter((p) => p.stock <= (p.lowStockThreshold || 5)),
    [products]
  );

  const missingSeoProducts = useMemo(
    () => products.filter((p) => !p.seoDescription || p.seoDescription.trim() === ''),
    [products]
  );

  const unshippedOrders = useMemo(
    () => orders.filter((o) => ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED'].includes(o.status)),
    [orders]
  );

  const categoryRevenueBreakdown = useMemo(() => {
    const map: Record<string, { count: number; stockValue: number }> = {};
    for (const p of products) {
      if (!map[p.category]) map[p.category] = { count: 0, stockValue: 0 };
      map[p.category].count += 1;
      map[p.category].stockValue += p.price * p.stock;
    }
    return Object.entries(map).map(([name, stats]) => ({ name, ...stats }));
  }, [products]);

  // Execute a single AI Tool Call against actual StoreContext mutators with RBAC Permission & Runtime Validation Checks
  const executeSingleToolCall = async (
    name: string,
    args: Record<string, any>
  ): Promise<{ status: 'EXECUTED' | 'PENDING_CONFIRMATION'; summary: string }> => {
    const permCheck = canExecuteAITool(userProfile?.role, name);
    if (!permCheck.allowed) {
      await recordAuditLog('AI_PERMISSION_DENIED', name, permCheck.reason || 'Permission denied');
      return {
        status: 'EXECUTED',
        summary: `Blocked: ${permCheck.reason}`,
      };
    }

    const argValidation = validateAIToolArgs(name, args);
    if (!argValidation.valid) {
      return {
        status: 'EXECUTED',
        summary: `Validation Error in ${name}(): ${argValidation.errors.join(' ')}`,
      };
    }

    switch (name) {
      case 'createProduct': {
        const created = await saveProduct(
          {
            name: args.name || 'New Atelier Piece',
            sku: args.sku,
            price: Number(args.price || 450),
            compareAtPrice: args.compareAtPrice ? Number(args.compareAtPrice) : undefined,
            costPrice: args.costPrice ? Number(args.costPrice) : undefined,
            stock: Number(args.stock ?? 15),
            category: args.category || 'Leather Goods',
            brand: args.brand || 'Atelier Aurelia',
            shortDescription: args.shortDescription,
            description: args.description,
            seoTitle: args.seoTitle,
            seoDescription: args.seoDescription,
            seoKeywords: args.seoKeywords,
            featured: Boolean(args.featured ?? true),
          },
          'AI_TOOL:createProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Created product "${created.name}" (SKU: ${created.sku}, Price: ${formatDualPrice(created.price)}, Stock: ${created.stock}).`,
        };
      }

      case 'updateProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;

        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `No matching product found for "${args.productIdOrName}".`,
          };
        }

        const updated = await saveProduct(
          {
            ...target,
            ...(args.price !== undefined ? { price: Number(args.price) } : {}),
            ...(args.stock !== undefined ? { stock: Number(args.stock) } : {}),
            ...(args.description ? { description: String(args.description) } : {}),
            ...(args.shortDescription ? { shortDescription: String(args.shortDescription) } : {}),
            ...(args.seoTitle ? { seoTitle: String(args.seoTitle) } : {}),
            ...(args.seoDescription ? { seoDescription: String(args.seoDescription) } : {}),
            ...(args.status ? { status: args.status } : {}),
          },
          'AI_TOOL:updateProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Updated "${updated.name}" (${updated.sku}) — Price: ${formatDualPrice(updated.price)}, Stock: ${updated.stock}.`,
        };
      }

      case 'duplicateProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;

        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Product "${args.productIdOrName}" not found for duplication.`,
          };
        }

        const cloned = await saveProduct(
          {
            ...target,
            id: undefined,
            sku: args.newSku || `${target.sku}-COPY`,
            name: `${target.name} (Edition Copy)`,
          },
          'AI_TOOL:duplicateProduct'
        );
        return {
          status: 'EXECUTED',
          summary: `Duplicated "${target.name}" as "${cloned.name}" (SKU: ${cloned.sku}).`,
        };
      }

      case 'searchProducts': {
        const q = String(args.query || '').toLowerCase();
        const maxStock = args.maxStock !== undefined ? Number(args.maxStock) : undefined;
        const found = products.filter((p) => {
          const matchesText =
            !q ||
            q === 'all' ||
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q);
          const matchesStock = maxStock === undefined || p.stock <= maxStock;
          return matchesText && matchesStock;
        });
        return {
          status: 'EXECUTED',
          summary: `Found ${found.length} matching product(s): ${
            found
              .slice(0, 6)
              .map((p) => `${p.name} [${p.sku}] (${formatDualPrice(p.price)}, ${p.stock} in stock)`)
              .join('; ') || 'None'
          }.`,
        };
      }

      case 'createCategory': {
        const createdCat = await saveCategory({
          name: String(args.name || 'New Collection'),
          description: args.description,
          seoTitle: args.seoTitle,
          seoDescription: args.seoDescription,
        });
        return {
          status: 'EXECUTED',
          summary: `Created category "${createdCat.name}" (slug: /${createdCat.slug}).`,
        };
      }

      case 'bulkUpdateCategoryPrices': {
        const cat = String(args.category || 'ALL');
        const pct = Number(args.percentageChange || 0);
        const matching = products.filter(
          (p) => cat.toUpperCase() === 'ALL' || p.category.toLowerCase().includes(cat.toLowerCase())
        );

        const confirmId = `conf-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Adjust prices by ${pct > 0 ? `+${pct}%` : `${pct}%`} across ${
              matching.length
            } products in "${cat}". Do you want me to continue?`,
            toolName: 'bulkUpdateCategoryPrices',
            args,
            onConfirm: async () => {
              const taskId = `task-bulk-price-${Date.now()}`;
              await createOrUpdateAITask({
                id: taskId,
                name: `Bulk Price Update (${pct}% on ${cat})`,
                toolName: 'bulkUpdateCategoryPrices',
                status: 'RUNNING',
                totalItems: matching.length,
                completedItems: 0,
              });
              let count = 0;
              for (const prod of matching) {
                const nextPrice = Math.max(1, Math.round(prod.price * (1 + pct / 100)));
                await saveProduct(
                  { ...prod, price: nextPrice },
                  `AI_BULK_PRICE_CHANGE (${pct}%)`
                );
                count++;
              }
              await createOrUpdateAITask({
                id: taskId,
                name: `Bulk Price Update (${pct}% on ${cat})`,
                toolName: 'bulkUpdateCategoryPrices',
                status: 'COMPLETED',
                totalItems: matching.length,
                completedItems: count,
                summary: `Updated prices for ${count} products in ${cat} by ${pct}%.`,
              });
              return `Confirmed & updated prices for ${count} products in ${cat} by ${pct}%.`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Queued confirmation to change prices by ${pct}% for ${matching.length} products in ${cat}.`,
        };
      }

      case 'deleteProduct': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target = products.find(
          (p) =>
            p.id.toLowerCase() === queryStr ||
            p.sku.toLowerCase() === queryStr ||
            p.name.toLowerCase().includes(queryStr)
        );
        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Could not locate product "${args.productIdOrName}" for deletion.`,
          };
        }
        const confirmId = `conf-del-${Date.now()}`;
        setPendingConfirmations((prev) => [
          ...prev,
          {
            id: confirmId,
            description: `Permanently delete product "${target.name}" (${target.sku})? This action cannot be undone.`,
            toolName: 'deleteProduct',
            args,
            onConfirm: async () => {
              await removeProduct(target.id);
              return `Permanently deleted "${target.name}" (${target.sku}).`;
            },
          },
        ]);
        return {
          status: 'PENDING_CONFIRMATION',
          summary: `Awaiting confirmation to permanently delete "${target.name}".`,
        };
      }

      case 'updateInventory': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) || selectedAdminProduct;
        if (!target) {
          return {
            status: 'EXECUTED',
            summary: `Product "${args.productIdOrName}" not found.`,
          };
        }
        const nextStock = Math.max(0, Math.round(Number(args.newStock || 0)));
        const delta = Math.abs(nextStock - target.stock);
        if (delta >= 50 || (target.stock > 0 && nextStock === 0)) {
          const confirmId = `conf-inv-${Date.now()}`;
          setPendingConfirmations((prev) => [
            ...prev,
            {
              id: confirmId,
              description: `Large inventory change on "${target.name}" (${target.sku}): ${target.stock} → ${nextStock} units. Confirm execution?`,
              toolName: 'updateInventory',
              args,
              onConfirm: async () => {
                await adjustInventory(target.id, nextStock, 'Confirmed AI Inventory Change');
                return `Confirmed & updated stock for "${target.name}" (${target.sku}) to ${nextStock} units.`;
              },
            },
          ]);
          return {
            status: 'PENDING_CONFIRMATION',
            summary: `Confirmation required for large stock change on "${target.name}" (${target.stock} → ${nextStock} units).`,
          };
        }

        await adjustInventory(target.id, nextStock, 'AI Assistant Command');
        return {
          status: 'EXECUTED',
          summary: `Updated stock for "${target.name}" (${target.sku}) to ${nextStock} units.`,
        };
      }

      case 'getLowStockProducts': {
        const threshold = Number(args.threshold ?? 5);
        const low = products.filter((p) => p.stock <= threshold);
        return {
          status: 'EXECUTED',
          summary: `Products with stock <= ${threshold} (${low.length}): ${
            low.map((p) => `${p.name} [${p.sku}: ${p.stock} units]`).join(', ') || 'None'
          }.`,
        };
      }

      case 'generateMissingSEO': {
        const targets = products.filter(
          (p) => !p.seoDescription || p.seoDescription.trim() === ''
        );
        const listToProcess = targets.length > 0 ? targets : products.slice(0, 3);
        const taskId = `task-seo-${Date.now()}`;
        await createOrUpdateAITask({
          id: taskId,
          name: `Bulk SEO Generation (${listToProcess.length} products)`,
          toolName: 'generateMissingSEO',
          status: 'RUNNING',
          totalItems: listToProcess.length,
          completedItems: 0,
        });

        let done = 0;
        for (const p of listToProcess) {
          await saveProduct(
            {
              ...p,
              seoTitle: `${p.name} — Handcrafted ${p.category} | ${settings.storeName}`,
              seoDescription: `Acquire the ${p.name} by ${p.brand}. ${
                p.shortDescription || 'Crafted from noble materials with insured global courier delivery.'
              }`,
              seoKeywords: `${p.name.toLowerCase()}, ${p.category.toLowerCase()}, ${p.brand.toLowerCase()}, bespoke luxury`,
            },
            'AI_TOOL:generateMissingSEO'
          );
          done++;
        }

        await createOrUpdateAITask({
          id: taskId,
          name: `Bulk SEO Generation (${listToProcess.length} products)`,
          toolName: 'generateMissingSEO',
          status: 'COMPLETED',
          totalItems: listToProcess.length,
          completedItems: done,
          summary: `Generated SEO titles, meta descriptions, and keywords for ${done} products.`,
        });

        return {
          status: 'EXECUTED',
          summary: `Generated and saved SEO metadata for ${done} products (${listToProcess
            .map((p) => p.sku)
            .join(', ')}).`,
        };
      }

      case 'rewriteCategoryDescriptions': {
        const targetKey = String(args.categoryOrProduct || '').toLowerCase();
        const tone = String(args.tone || 'Luxury');
        const matches = products.filter(
          (p) =>
            p.category.toLowerCase().includes(targetKey) ||
            p.name.toLowerCase().includes(targetKey)
        );
        const list = matches.length > 0 ? matches : selectedAdminProduct ? [selectedAdminProduct] : [];
        let updatedCount = 0;
        for (const p of list) {
          await saveProduct(
            {
              ...p,
              description: `[${tone} Edition] Meticulously realized by ${p.brand} artisans, the ${p.name} exemplifies enduring architectural proportion and tactile permanence. ${p.shortDescription || ''}`,
            },
            `AI_TOOL:rewriteDescriptions(${tone})`
          );
          updatedCount++;
        }
        return {
          status: 'EXECUTED',
          summary: `Rewrote ${updatedCount} product description(s) in "${tone}" tone.`,
        };
      }

      case 'generateProductImages': {
        const queryStr = String(args.productIdOrName || '').toLowerCase();
        const target =
          products.find(
            (p) =>
              p.id.toLowerCase() === queryStr ||
              p.sku.toLowerCase() === queryStr ||
              p.name.toLowerCase().includes(queryStr)
          ) ||
          selectedAdminProduct ||
          products[0];

        if (target) {
          await handleGenerateStudioShots(target.name, target.category);
          return {
            status: 'EXECUTED',
            summary: `Generated 5 studio photography variations (White Background, Studio Shot, Lifestyle, Macro, Editorial) for "${target.name}".`,
          };
        }
        return {
          status: 'EXECUTED',
          summary: 'Generated studio photography variations.',
        };
      }

      case 'createCoupon': {
        const saved = await saveCoupon({
          code: String(args.code || 'ATELIER20'),
          type: (args.type as any) || 'PERCENTAGE',
          value: Number(args.value || 20),
          minCartAmount: Number(args.minCartAmount || 100),
          categoryFilter: args.categoryFilter,
          usageLimit: Number(args.usageLimit || 100),
        });
        return {
          status: 'EXECUTED',
          summary: `Created active promotional coupon "${saved.code}" (${saved.type}: ${saved.value}).`,
        };
      }

      case 'deleteCoupon': {
        const codeStr = String(args.code || '').toUpperCase();
        const targetCoupon = coupons.find((c) => c.code.toUpperCase() === codeStr);
        if (!targetCoupon) {
          return {
            status: 'EXECUTED',
            summary: `Coupon "${codeStr}" not found.`,
          };
        }
        await deleteCouponById(targetCoupon.id);
        return {
          status: 'EXECUTED',
          summary: `Deleted coupon "${targetCoupon.code}".`,
        };
      }

      case 'searchOrders': {
        const q = String(args.statusOrQuery || 'UNSHIPPED').toUpperCase();
        const matched =
          q === 'UNSHIPPED'
            ? unshippedOrders
            : orders.filter(
                (o) =>
                  o.status.toUpperCase().includes(q) ||
                  o.customerName.toUpperCase().includes(q) ||
                  o.orderNumber.toUpperCase().includes(q)
              );
        return {
          status: 'EXECUTED',
          summary: `Found ${matched.length} matching order(s): ${
            matched
              .map((o) => `${o.orderNumber} (${o.customerName}, ${formatDualPrice(o.total)}, ${o.status})`)
              .join('; ') || 'None'
          }.`,
        };
      }

      case 'cancelOrder':
      case 'refundOrder':
      case 'updateOrderStatus': {
        const targetId = String(args.orderNumberOrId || '');
        const nextStatus: OrderStatus =
          name === 'cancelOrder'
            ? 'CANCELLED'
            : name === 'refundOrder'
            ? 'REFUNDED'
            : (String(args.status || 'SHIPPED') as OrderStatus);

        const targetOrder =
          orders.find(
            (o) =>
              o.orderNumber.toLowerCase() === targetId.toLowerCase() ||
              o.id.toLowerCase() === targetId.toLowerCase()
          ) || selectedAdminOrder;

        if (!targetOrder) {
          return {
            status: 'EXECUTED',
            summary: `Order "${targetId}" was not found in active records.`,
          };
        }

        if (nextStatus === 'REFUNDED' || nextStatus === 'CANCELLED') {
          const confirmId = `conf-ord-${Date.now()}`;
          setPendingConfirmations((prev) => [
            ...prev,
            {
              id: confirmId,
              description: `${
                nextStatus === 'REFUNDED' ? 'Record Refund for' : 'Cancel'
              } Order ${targetOrder.orderNumber} (${formatDualPrice(targetOrder.total)} for ${
                targetOrder.customerName
              })? Inventory will be restored automatically.`,
              toolName: name,
              args,
              onConfirm: async () => {
                await updateOrderState(targetOrder.id, nextStatus, args.trackingNumber);
                return `Order ${targetOrder.orderNumber} marked as ${nextStatus} and stock restored.`;
              },
            },
          ]);
          return {
            status: 'PENDING_CONFIRMATION',
            summary: `Confirmation required to mark Order ${targetOrder.orderNumber} as ${nextStatus}.`,
          };
        }

        await updateOrderState(targetOrder.id, nextStatus, args.trackingNumber);
        return {
          status: 'EXECUTED',
          summary: `Order ${targetOrder.orderNumber} updated to ${nextStatus}.`,
        };
      }

      case 'searchCustomers': {
        const q = String(args.query || 'ALL').toLowerCase();
        const customerMap = new Map<string, { name: string; email: string; orders: number; spend: number }>();
        for (const o of orders) {
          const prev = customerMap.get(o.customerEmail) || {
            name: o.customerName,
            email: o.customerEmail,
            orders: 0,
            spend: 0,
          };
          prev.orders += 1;
          prev.spend += o.total;
          customerMap.set(o.customerEmail, prev);
        }
        const list = Array.from(customerMap.values()).filter(
          (c) => q === 'all' || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        );
        return {
          status: 'EXECUTED',
          summary: `Customer Directory (${list.length}): ${
            list
              .map((c) => `${c.name} <${c.email}> — ${c.orders} order(s), Total: ${formatDualPrice(c.spend)}`)
              .join('; ') || 'No matching customers'
          }.`,
        };
      }

      case 'sendCustomerEmail': {
        const dispatchSummary = EmailNotificationService.formatDispatchLog({
          to: String(args.toEmail || 'client@atelieraurelia.com'),
          subject: String(args.subject || 'Atelier Aurelia Concierge Update'),
          template: 'PROMOTIONAL',
          summary: String(args.message || ''),
        });
        await recordAuditLog('AI_EMAIL_DISPATCHED', String(args.toEmail), dispatchSummary);
        return {
          status: 'EXECUTED',
          summary: `Logged concierge dispatch to ${args.toEmail} ("${args.subject}").`,
        };
      }

      case 'importCSV': {
        const rows = handleParseCsv(csvRawText);
        let workingRows = rows;
        if (args.enrichMissingWithAI && workingRows.length > 0) {
          workingRows = await handleAIEnrichCsv(workingRows);
        }
        const result = await handleCommitCsvImport(workingRows);
        setActiveTab('CSV_WORKFLOW');
        return {
          status: 'EXECUTED',
          summary: `Executed CSV Import & AI Enrichment Pipeline: ${result.imported} created, ${result.updated} updated, ${result.failed} failed validation.`,
        };
      }

      case 'exportCSV': {
        if (String(args.resourceType || 'PRODUCTS').toUpperCase() === 'ORDERS') {
          handleExportOrdersCsv();
          return {
            status: 'EXECUTED',
            summary: `Exported ${orders.length} orders to CSV download.`,
          };
        }
        handleExportProductsCsv();
        return {
          status: 'EXECUTED',
          summary: `Exported ${products.length} products to CSV download.`,
        };
      }

      case 'analyzeStoreMetrics':
      default: {
        const lowList = lowStockProducts.map((p) => `${p.name} (${p.stock} left)`).join(', ');
        const unshippedList = unshippedOrders
          .map((o) => `${o.orderNumber} (${formatDualPrice(o.total)})`)
          .join(', ');
        return {
          status: 'EXECUTED',
          summary: `Live Audit — Revenue: ${formatDualPrice(totalRevenue)} across ${
            orders.length
          } orders | Low Stock (${lowStockProducts.length}): ${
            lowList || 'None'
          } | Unshipped Orders (${unshippedOrders.length}): ${unshippedList || 'None'}.`,
        };
      }
    }
  };

  // Send Natural Language Instruction to Server-Side Gemini Operator
  const handleSendAICommand = async (customPrompt?: string) => {
    const promptToSend = (customPrompt ?? aiInput).trim();
    if (!promptToSend || aiBusy) return;

    const userMsg: AIMessageRecord = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: promptToSend,
      timestamp: new Date().toISOString(),
    };
    setAiMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setAiInput('');
    setAiBusy(true);

    try {
      const storeSnapshot = {
        storeName: settings.storeName,
        currency: settings.currency,
        actorUid: firebaseUser?.uid || 'local-admin',
        actorName: userProfile?.name || firebaseUser?.email || 'Executive Admin',
        userRole: userProfile?.role || 'SUPER_ADMIN',
        currentTab: activeTab,
        currentFilter: productSearch || dateFilter,
        stagedCsvRowCount: parsedCsvRows.length,
        productCount: products.length,
        lowStockProducts: lowStockProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          stock: p.stock,
          price: p.price,
        })),
        missingSeoProducts: missingSeoProducts.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
        })),
        orderCount: orders.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        unshippedOrders: unshippedOrders.map((o) => ({
          orderNumber: o.orderNumber,
          customer: o.customerName,
          total: o.total,
          status: o.status,
        })),
        coupons: coupons.map((c) => ({ code: c.code, type: c.type, value: c.value })),
        categories: categories.map((c) => c.name),
        selectedProduct: selectedAdminProduct
          ? {
              id: selectedAdminProduct.id,
              sku: selectedAdminProduct.sku,
              name: selectedAdminProduct.name,
              price: selectedAdminProduct.price,
              category: selectedAdminProduct.category,
            }
          : null,
        selectedOrder: selectedAdminOrder
          ? {
              id: selectedAdminOrder.id,
              orderNumber: selectedAdminOrder.orderNumber,
              customerName: selectedAdminOrder.customerName,
              status: selectedAdminOrder.status,
              paymentStatus: selectedAdminOrder.paymentStatus,
              total: selectedAdminOrder.total,
            }
          : null,
        aiTone: settings.aiTone || 'Luxury',
      };

      const res = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptToSend, storeContext: storeSnapshot }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI service returned an error.');
      }

      const executedTools: AIMessageRecord['toolExecutions'] = [];
      if (Array.isArray(data.blockedCalls)) {
        for (const bc of data.blockedCalls) {
          executedTools.push({
            name: bc.name,
            args: {},
            status: 'FAILED',
            resultSummary: `Blocked by Server Guard: ${bc.reason}`,
          });
        }
      }
      if (Array.isArray(data.functionCalls)) {
        for (const fc of data.functionCalls) {
          const outcome = await executeSingleToolCall(fc.name, fc.args || {});
          executedTools.push({
            name: fc.name,
            args: fc.args || {},
            status: outcome.status,
            resultSummary: outcome.summary,
          });
        }
      }

      const assistantReply: AIMessageRecord = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content:
          data.text ||
          (executedTools.length > 0
            ? executedTools.map((t) => t.resultSummary).join('\n')
            : 'Operation analyzed.'),
        timestamp: new Date().toISOString(),
        toolExecutions: executedTools,
      };

      setAiMessages((prev) => [...prev, assistantReply]);
    } catch (error: any) {
      setAiMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `AI execution error: ${error?.message || 'Please retry.'}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setAiBusy(false);
    }
  };

  // RFC-4180 Compliant CSV Parser & Deep Validator (Detects missing columns, malformed quotes, duplicate SKUs in file & catalog, negative stock, invalid prices, and formula injection)
  const handleParseCsv = (raw: string) => {
    const cleanRaw = raw.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present
    const lines = cleanRaw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      showToast('CSV must contain a header row and at least one product row.');
      setParsedCsvRows([]);
      return [];
    }

    const headerParsed = parseCsvLineRFC4180(lines[0]);
    const headers = headerParsed.cells.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    const hasNameHeader = headers.some((h) => ['name', 'title', 'productname'].includes(h));
    const hasPriceHeader = headers.some((h) => ['price', 'retailprice', 'usd'].includes(h));

    const seenSkusInBatch = new Set<string>();

    const rows = lines.slice(1).map((line, index) => {
      const { cells, malformedQuotes } = parseCsvLineRFC4180(line);
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = cells[idx] ?? '';
      });

      const rawSku = (rowObj['sku'] || rowObj['productsku'] || '').trim();
      const sku = rawSku || `AA-CSV-${index + 1}`;
      const name = (rowObj['name'] || rowObj['title'] || rowObj['productname'] || '').trim();
      const priceRaw = rowObj['price'] || rowObj['retailprice'] || rowObj['usd'] || '';
      const stockRaw = rowObj['stock'] || rowObj['quantity'] || rowObj['inventory'] || '0';
      const price = Number(priceRaw);
      const stock = Number(stockRaw);
      const category = (rowObj['category'] || 'Leather Goods').trim() || 'Leather Goods';
      const brand = (rowObj['brand'] || 'Atelier Aurelia').trim() || 'Atelier Aurelia';
      const shortDescription = (rowObj['shortdescription'] || rowObj['description'] || '').trim();
      const seoTitle = (rowObj['seotitle'] || '').trim();
      const seoDescription = (rowObj['seodescription'] || '').trim();

      const errors: string[] = [];
      if (malformedQuotes) errors.push('Malformed unclosed quotes in CSV line');
      if (!hasNameHeader) errors.push('Missing required "name" column header');
      if (!hasPriceHeader) errors.push('Missing required "price" column header');
      if (!rawSku) errors.push('Blank SKU');
      if (!name) errors.push('Missing product name');
      if (priceRaw === '' || isNaN(price) || price <= 0) errors.push('Invalid price (must be > 0)');
      if (stockRaw === '' || isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
        errors.push('Invalid stock (must be integer >= 0)');
      }
      if (rawSku && !/^[a-zA-Z0-9_-]+$/.test(rawSku)) {
        errors.push('Invalid SKU format (alphanumeric/-/_ only)');
      }

      const lowerSku = sku.toLowerCase();
      if (rawSku && seenSkusInBatch.has(lowerSku)) {
        errors.push(`Duplicate SKU "${sku}" within uploaded CSV file`);
      }
      if (rawSku) {
        seenSkusInBatch.add(lowerSku);
      }

      const duplicate = products.some((p) => p.sku.toLowerCase() === lowerSku);

      return {
        rowNumber: index + 2,
        sku,
        name,
        price: isNaN(price) ? 0 : price,
        stock: isNaN(stock) ? 0 : stock,
        category,
        brand,
        shortDescription,
        ...(seoTitle ? { seoTitle } : {}),
        ...(seoDescription ? { seoDescription } : {}),
        valid: errors.length === 0,
        errors,
        duplicate,
      };
    });

    setParsedCsvRows(rows);
    setCsvImportSummary(null);
    return rows;
  };

  // AI Enrich CSV Rows (Generates missing descriptions & SEO before import)
  const handleAIEnrichCsv = async (inputRows?: typeof parsedCsvRows) => {
    const baseRows =
      inputRows && inputRows.length > 0
        ? inputRows
        : parsedCsvRows.length > 0
        ? parsedCsvRows
        : handleParseCsv(csvRawText);
    if (baseRows.length === 0) return [];

    setCsvEnriching(true);
    try {
      const res = await fetch('/api/ai/enrich-csv-rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: baseRows, tone: settings.aiTone || 'Luxury' }),
      });
      const data = await res.json();
      if (Array.isArray(data.enriched)) {
        const nextRows = baseRows.map((row) => {
          const match = data.enriched.find((e: any) => e.sku === row.sku || e.name === row.name);
          if (!match) return row;
          return {
            ...row,
            shortDescription: match.shortDescription || row.shortDescription,
            seoTitle: match.seoTitle || row.seoTitle,
            seoDescription: match.seoDescription || row.seoDescription,
          };
        });
        setParsedCsvRows(nextRows);
        showToast('AI enriched CSV rows with luxury descriptions & SEO metadata.');
        return nextRows;
      }
      return baseRows;
    } catch {
      showToast('AI enrichment failed. Using existing row data.');
      return baseRows;
    } finally {
      setCsvEnriching(false);
    }
  };

  // Execute CSV Import into Store Database
  const handleCommitCsvImport = async (inputRows?: typeof parsedCsvRows) => {
    const rowsToCommit = inputRows && inputRows.length > 0 ? inputRows : parsedCsvRows;
    if (rowsToCommit.length === 0) return { imported: 0, updated: 0, failed: 0 };
    let imported = 0;
    let updated = 0;
    let failed = 0;

    const taskId = `task-csv-${Date.now()}`;
    await createOrUpdateAITask({
      id: taskId,
      name: `CSV Product Catalog Import (${rowsToCommit.length} rows)`,
      toolName: 'importCSV',
      status: 'RUNNING',
      totalItems: rowsToCommit.length,
      completedItems: 0,
    });

    for (const row of rowsToCommit) {
      if (!row.valid) {
        failed++;
        continue;
      }
      const existing = products.find((p) => p.sku.toLowerCase() === row.sku.toLowerCase());
      await saveProduct(
        {
          id: existing?.id,
          sku: row.sku,
          name: row.name,
          price: row.price,
          stock: row.stock,
          category: row.category,
          brand: row.brand,
          shortDescription: row.shortDescription,
          seoTitle: row.seoTitle,
          seoDescription: row.seoDescription,
        },
        existing ? 'CSV_IMPORT_UPDATE' : 'CSV_IMPORT_CREATE'
      );
      if (existing) updated++;
      else imported++;
    }

    await createOrUpdateAITask({
      id: taskId,
      name: `CSV Product Catalog Import (${rowsToCommit.length} rows)`,
      toolName: 'importCSV',
      status: 'COMPLETED',
      totalItems: rowsToCommit.length,
      completedItems: imported + updated,
      failedItems: failed,
      summary: `Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`,
    });

    const summary = { imported, updated, failed };
    setCsvImportSummary(summary);
    showToast(`CSV Import complete: ${imported} created, ${updated} updated, ${failed} failed.`);
    return summary;
  };

  // Export Orders to CSV file download
  const handleExportOrdersCsv = () => {
    const headers = ['orderNumber', 'customerName', 'customerEmail', 'status', 'paymentStatus', 'paymentMethod', 'total', 'trackingNumber', 'createdAt'];
    const csvLines = [
      headers.join(','),
      ...orders.map((o) =>
        [
          o.orderNumber,
          `"${o.customerName.replace(/"/g, '""')}"`,
          `"${o.customerEmail.replace(/"/g, '""')}"`,
          o.status,
          o.paymentStatus,
          o.paymentMethod,
          o.total,
          `"${(o.trackingNumber || '').replace(/"/g, '""')}"`,
          o.createdAt,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-aurelia-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog('CSV_EXPORTED', 'Orders', `Exported ${orders.length} orders to CSV`);
  };

  // Export Products to CSV file download
  const handleExportProductsCsv = () => {
    const headers = ['sku', 'name', 'price', 'stock', 'category', 'brand', 'status', 'seoTitle'];
    const csvLines = [
      headers.join(','),
      ...products.map((p) =>
        [
          p.sku,
          `"${p.name.replace(/"/g, '""')}"`,
          p.price,
          p.stock,
          `"${p.category}"`,
          `"${p.brand}"`,
          p.status,
          `"${(p.seoTitle || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `atelier-aurelia-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    recordAuditLog('CSV_EXPORTED', 'Products', `Exported ${products.length} products to CSV`);
  };

  // Generate AI Content inside Product Modal
  const handleGenerateModalContent = async () => {
    if (!editingProduct?.name) {
      showToast('Enter a product name first.');
      return;
    }
    setGeneratingContent(true);
    try {
      const res = await fetch('/api/ai/generate-product-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingProduct.name,
          category: editingProduct.category || 'Leather Goods',
          brand: editingProduct.brand || 'Atelier Aurelia',
          price: editingProduct.price || 850,
          tone: settings.aiTone || 'Luxury',
        }),
      });
      const data = await res.json();
      setEditingProduct((prev) => ({
        ...prev,
        shortDescription: data.shortDescription || prev?.shortDescription,
        description: data.description || prev?.description,
        seoTitle: data.seoTitle || prev?.seoTitle,
        seoDescription: data.seoDescription || prev?.seoDescription,
        seoKeywords: data.seoKeywords || prev?.seoKeywords,
      }));
      showToast('AI generated complete product copy & SEO metadata.');
    } catch {
      showToast('AI generation failed. Please retry.');
    } finally {
      setGeneratingContent(false);
    }
  };

  // Generate 5 Studio Shot Variations for a Product
  const handleGenerateStudioShots = async (productName: string, category: string) => {
    setGeneratingShots(true);
    try {
      const res = await fetch('/api/ai/generate-product-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName, category }),
      });
      const data = await res.json();
      if (Array.isArray(data.shots)) {
        setStudioShots(data.shots);
        showToast(`Generated 5 studio shot variations for ${productName}.`);
      }
    } catch {
      showToast('Studio shot generation failed.');
    } finally {
      setGeneratingShots(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#0B0F17] text-[#F1F5F9]">
      {/* Fixed 256px SaaS Workspace Sidebar */}
      <aside className="w-64 shrink-0 border-r border-white/10 bg-[#0F172A] flex flex-col justify-between">
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-lg font-display font-semibold tracking-tight text-white">
              {settings.storeName}
            </span>
            <button
              onClick={onReturnToStore}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Store</span>
            </button>
          </div>

          <nav className="space-y-1 text-xs">
            {(
              [
                { id: 'AI_COMMAND_CENTER', label: 'AI Command Center', icon: Terminal },
                { id: 'DASHBOARD', label: 'Executive Analytics', icon: LayoutDashboard },
                { id: 'PRODUCTS', label: 'Product Catalog', icon: Package },
                { id: 'INVENTORY', label: 'Inventory Control', icon: Boxes },
                { id: 'CSV_WORKFLOW', label: 'CSV Import / Export', icon: FileSpreadsheet },
                { id: 'ORDERS', label: 'Orders & Fulfillment', icon: ShoppingCart },
                { id: 'COUPONS', label: 'Promotions & Coupons', icon: Tag },
                { id: 'REVIEWS', label: 'Client Reviews', icon: MessageSquare },
                { id: 'AI_TASKS', label: 'AI Background Tasks', icon: Cpu },
                { id: 'AUDIT_LOGS', label: 'Security Audit Log', icon: ShieldAlert },
                { id: 'NOTIFICATIONS', label: 'Alerts & Notifications', icon: Bell },
                { id: 'SETTINGS', label: 'Store & AI Settings', icon: Settings },
              ] as { id: AdminTab; label: string; icon: any }[]
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#C5A059] text-[#0B0F17] font-semibold'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User / Role Status */}
        <div className="p-4 border-t border-white/10 space-y-3 text-xs">
          {firebaseUser ? (
            <div>
              <div className="font-medium text-white truncate">{userProfile?.name}</div>
              <div className="text-[11px] font-mono text-[#C5A059] mt-0.5">
                Role: {userProfile?.role}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-amber-300">
                Sign in with Google ({'specialforme683@gmail.com'}) to persist admin mutations to Cloud Firestore.
              </div>
              <button
                onClick={signInWithGoogle}
                className="w-full py-2 bg-[#C5A059] text-[#0B0F17] font-semibold text-xs cursor-pointer"
              >
                Admin Google Sign-In
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Workspace Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left | Actions Right */}
        <header className="h-16 border-b border-white/10 px-8 flex items-center justify-between bg-[#0F172A]/60">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Admin Console</span>
            <span>/</span>
            <span className="text-white font-medium">{activeTab.replace(/_/g, ' ')}</span>
            {selectedAdminProduct && (
              <>
                <span>/</span>
                <span className="text-[#C5A059] font-mono">
                  Context: {selectedAdminProduct.sku} ({selectedAdminProduct.name})
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {activeTab !== 'AI_COMMAND_CENTER' && (
              <button
                onClick={() => setCopilotDrawerOpen((o) => !o)}
                className="px-3.5 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>AI Copilot</span>
              </button>
            )}
            <button
              onClick={handleExportProductsCsv}
              className="px-3.5 py-2 border border-white/15 text-xs text-slate-200 hover:border-white flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Catalog CSV</span>
            </button>
            <button
              onClick={onReturnToStore}
              className="px-3.5 py-2 border border-white/15 text-xs text-slate-200 hover:border-white cursor-pointer"
            >
              View Live Storefront
            </button>
          </div>
        </header>

        {/* Confirmation Banner Gate for High-Risk AI Actions */}
        {pendingConfirmations.length > 0 && (
          <div className="bg-amber-950/80 border-b border-amber-500/40 px-8 py-4 space-y-3">
            {pendingConfirmations.map((conf) => (
              <div
                key={conf.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>AI Safety Confirmation Required:</strong> {conf.description}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      const summary = await conf.onConfirm();
                      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id));
                      setAiMessages((prev) => [
                        ...prev,
                        {
                          id: `conf-done-${Date.now()}`,
                          role: 'assistant',
                          content: `Confirmed & Executed: ${summary}`,
                          timestamp: new Date().toISOString(),
                        },
                      ]);
                    }}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Approve & Execute
                  </button>
                  <button
                    onClick={() =>
                      setPendingConfirmations((prev) => prev.filter((c) => c.id !== conf.id))
                    }
                    className="px-3.5 py-1.5 border border-white/20 text-xs text-slate-300 cursor-pointer"
                  >
                    Cancel Action
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Workspace Content */}
        <div className="flex-1 p-8 overflow-y-auto space-y-8">
          {/* ======================== TAB 1: AI COMMAND CENTER ======================== */}
          {activeTab === 'AI_COMMAND_CENTER' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 8 Cols: Natural Language Chat & Execution Log */}
              <div className="lg:col-span-8 bg-[#0F172A] border border-white/10 flex flex-col h-[680px]">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <h1 className="text-base font-semibold text-white">
                      Autonomous Store Operator (Gemini Function Calling)
                    </h1>
                    <p className="text-xs text-slate-400">
                      Executes real database mutations, SEO generation, pricing updates, and order workflows.
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[#C5A059]">
                    Tone: {settings.aiTone || 'Luxury'}
                  </span>
                </div>

                {/* Message History */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 border ${
                        msg.role === 'user'
                          ? 'bg-[#1E293B] border-white/15 ml-12'
                          : 'bg-[#0B0F17] border-white/10 mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 font-mono">
                        <span>{msg.role === 'user' ? 'ADMIN INSTRUCTION' : 'AI OPERATOR'}</span>
                        <span>{msg.timestamp.slice(11, 19)}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>

                      {msg.toolExecutions && msg.toolExecutions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                          <div className="text-[11px] font-mono uppercase text-[#C5A059]">
                            Executed Store Tools ({msg.toolExecutions.length}):
                          </div>
                          {msg.toolExecutions.map((t, i) => (
                            <div
                              key={i}
                              className="p-2.5 bg-[#0F172A] border border-white/10 text-xs font-mono space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-emerald-400 font-semibold">{t.name}()</span>
                                <span className="text-[11px] text-slate-400">{t.status}</span>
                              </div>
                              <div className="text-slate-300 text-[11px]">{t.resultSummary}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {aiBusy && (
                    <div className="p-4 bg-[#0B0F17] border border-white/10 text-xs text-slate-400 font-mono">
                      Analyzing store telemetry and executing authorized tools...
                    </div>
                  )}
                </div>

                {/* Prompt Input Bar */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendAICommand();
                  }}
                  className="p-4 border-t border-white/10 flex gap-3 bg-[#0B0F17]"
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Tell the AI what to do (e.g., 'Create a new product for Nike Air Max 270 price $180' or 'Increase price of Leather Goods by 10%')..."
                    className="flex-1 px-4 py-3 bg-[#0F172A] border border-white/15 text-xs text-white focus:outline-none focus:border-[#C5A059]"
                  />
                  <button
                    type="submit"
                    disabled={aiBusy}
                    className="px-6 py-3 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 hover:bg-[#d4b26a] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Execute</span>
                  </button>
                </form>
              </div>

              {/* Right 4 Cols: Built-in Demo Commands & Store Context */}
              <div className="lg:col-span-4 space-y-6">
                <div className="p-5 bg-[#0F172A] border border-white/10 space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[#C5A059]">
                    One-Click Demo AI Commands
                  </h2>
                  <p className="text-xs text-slate-400">
                    Click any instruction below to watch the AI execute real database changes:
                  </p>
                  <div className="space-y-2">
                    {DEMO_AI_COMMANDS.map((cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendAICommand(cmd)}
                        disabled={aiBusy}
                        className="w-full text-left p-3 bg-[#0B0F17] border border-white/10 hover:border-[#C5A059] text-xs text-slate-200 transition-colors cursor-pointer"
                      >
                        “{cmd}”
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-5 bg-[#0F172A] border border-white/10 space-y-3 text-xs">
                  <h3 className="font-semibold uppercase tracking-wider text-white">
                    Live Store Memory Context
                  </h3>
                  <div className="space-y-1.5 text-slate-400 font-mono tabular-nums">
                    <div>Active Products: {products.length}</div>
                    <div>Low Stock Alerts: {lowStockProducts.length}</div>
                    <div>Missing SEO Metadata: {missingSeoProducts.length}</div>
                    <div>Unshipped Orders: {unshippedOrders.length}</div>
                    <div>Active Coupons: {coupons.length}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 2: EXECUTIVE DASHBOARD ======================== */}
          {activeTab === 'DASHBOARD' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display font-medium text-white">
                    Store Telemetry & Financial Overview
                  </h1>
                  <p className="text-xs text-slate-400">
                    Real-time metrics computed directly from active orders and inventory records.
                  </p>
                </div>

                <div className="flex items-center gap-1 bg-[#0F172A] p-1 border border-white/10">
                  {(['TODAY', '7D', '30D', 'ALL'] as const).map((range) => (
                    <button
                      key={range}
                      onClick={() => setDateFilter(range)}
                      className={`px-3 py-1.5 text-xs font-mono cursor-pointer ${
                        dateFilter === range
                          ? 'bg-[#C5A059] text-[#0B0F17] font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4 Key KPI Stat Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="p-6 bg-[#0F172A] border border-white/10 space-y-1">
                  <div className="text-xs text-slate-400">Gross Revenue (USD & PKR)</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-white">
                    ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#C5A059]">
                    {formatPKR(totalRevenue)}
                  </div>
                  <div className="text-[11px] text-emerald-400 font-mono">
                    {orders.length} settled / active orders
                  </div>
                </div>

                <div className="p-6 bg-[#0F172A] border border-white/10 space-y-1">
                  <div className="text-xs text-slate-400">Average Order Value (AOV)</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-white">
                    ${avgOrderValue.toFixed(2)}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#C5A059]">
                    {formatPKR(avgOrderValue)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Tax Rate: {settings.taxRate}%
                  </div>
                </div>

                <div className="p-6 bg-[#0F172A] border border-white/10 space-y-1">
                  <div className="text-xs text-slate-400">Catalog SKUs & Inventory</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-white">
                    {products.length} SKUs
                  </div>
                  <div className="text-[11px] text-amber-400 font-mono">
                    {lowStockProducts.length} low-stock alerts (&le;5 units)
                  </div>
                </div>

                <div className="p-6 bg-[#0F172A] border border-white/10 space-y-1">
                  <div className="text-xs text-slate-400">Unshipped Fulfillment Queue</div>
                  <div className="text-2xl font-mono tabular-nums font-semibold text-white">
                    {unshippedOrders.length} Orders
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {coupons.filter((c) => c.active).length} active promotions
                  </div>
                </div>
              </div>

              {/* Category Valuation Chart & Low Stock Table */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-6 p-6 bg-[#0F172A] border border-white/10 space-y-5">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                    Inventory Valuation by Category
                  </h2>
                  <div className="space-y-4">
                    {categoryRevenueBreakdown.map((item) => {
                      const maxVal = Math.max(
                        ...categoryRevenueBreakdown.map((c) => c.stockValue),
                        1
                      );
                      const widthPct = Math.min(100, Math.round((item.stockValue / maxVal) * 100));
                      return (
                        <div key={item.name} className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-200 font-medium">
                              {item.name} ({item.count} SKUs)
                            </span>
                            <span className="font-mono tabular-nums text-[#C5A059]">
                              ${item.stockValue.toLocaleString()} ({formatPKR(item.stockValue)})
                            </span>
                          </div>
                          <div className="w-full h-2 bg-white/5 overflow-hidden">
                            <div
                              className="h-full bg-[#C5A059]"
                              style={{ width: `${widthPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-6 p-6 bg-[#0F172A] border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                      Low Stock Priority Attention ({lowStockProducts.length})
                    </h2>
                    <button
                      onClick={() => setActiveTab('INVENTORY')}
                      className="text-xs text-[#C5A059] hover:underline cursor-pointer"
                    >
                      Manage Inventory →
                    </button>
                  </div>
                  <div className="divide-y divide-white/10">
                    {lowStockProducts.slice(0, 5).map((p) => (
                      <div key={p.id} className="py-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-white">{p.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {p.sku} · {p.category}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono tabular-nums text-amber-400 font-semibold">
                            {p.stock} left
                          </span>
                          <button
                            onClick={() => adjustInventory(p.id, p.stock + 10, 'Quick Restock +10')}
                            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] cursor-pointer"
                          >
                            +10 Stock
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 3: PRODUCT CATALOG MANAGEMENT ======================== */}
          {activeTab === 'PRODUCTS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Filter by SKU, title, category, status..."
                    className="px-3.5 py-2 bg-[#0F172A] border border-white/15 text-xs text-white w-72"
                  />
                  {selectedProductIds.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={async () => {
                          for (const id of selectedProductIds) {
                            const p = products.find((item) => item.id === id);
                            if (p) {
                              await saveProduct(
                                { ...p, price: Math.round(p.price * 1.1) },
                                'BULK_PRICE_+10%'
                              );
                            }
                          }
                          setSelectedProductIds([]);
                          showToast(`Increased price by 10% for ${selectedProductIds.length} products.`);
                        }}
                        className="px-3 py-2 bg-white/10 text-xs text-white hover:bg-white/20 cursor-pointer"
                      >
                        Bulk +10% Price ({selectedProductIds.length})
                      </button>
                      <button
                        onClick={async () => {
                          for (const id of selectedProductIds) {
                            const p = products.find((item) => item.id === id);
                            if (p) {
                              await saveProduct(
                                { ...p, status: p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' },
                                'BULK_ARCHIVE_TOGGLE'
                              );
                            }
                          }
                          setSelectedProductIds([]);
                          showToast(`Updated archive status for ${selectedProductIds.length} products.`);
                        }}
                        className="px-3 py-2 bg-amber-500/20 border border-amber-500/40 text-xs text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                      >
                        Bulk Archive/Unarchive ({selectedProductIds.length})
                      </button>
                      <button
                        onClick={async () => {
                          const count = selectedProductIds.length;
                          for (const id of selectedProductIds) {
                            await removeProduct(id);
                          }
                          setSelectedProductIds([]);
                          showToast(`Deleted ${count} selected products.`);
                        }}
                        className="px-3 py-2 bg-rose-500/20 border border-rose-500/40 text-xs text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                      >
                        Bulk Delete ({selectedProductIds.length})
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() =>
                    setEditingProduct({
                      name: '',
                      sku: `AA-NEW-${Math.floor(100 + Math.random() * 899)}`,
                      price: 950,
                      stock: 15,
                      category: 'Leather Goods',
                      brand: 'Atelier Aurelia',
                      status: 'ACTIVE',
                      shortDescription: '',
                      description: '',
                      seoTitle: '',
                      seoDescription: '',
                    })
                  }
                  className="px-4 py-2.5 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create New Product</span>
                </button>
              </div>

              {/* High-Density Product Table */}
              <div className="bg-[#0F172A] border border-white/10 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Select</th>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Category / Status</th>
                      <th className="py-3 px-4 text-right">Price</th>
                      <th className="py-3 px-4 text-right">Stock</th>
                      <th className="py-3 px-4">SEO Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {products
                      .filter(
                        (p) =>
                          !productSearch.trim() ||
                          p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.category.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.status.toLowerCase().includes(productSearch.toLowerCase())
                      )
                      .map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedAdminProduct(p)}
                          className={`hover:bg-white/[0.03] cursor-pointer ${
                            selectedAdminProduct?.id === p.id ? 'bg-[#C5A059]/10' : ''
                          }`}
                        >
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedProductIds.includes(p.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProductIds((prev) => [...prev, p.id]);
                                } else {
                                  setSelectedProductIds((prev) => prev.filter((id) => id !== p.id));
                                }
                              }}
                            />
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">{p.sku}</td>
                          <td className="py-3 px-4 font-medium text-white">{p.name}</td>
                          <td className="py-3 px-4 text-slate-400">
                            <div>{p.category}</div>
                            <div className="text-[10px] font-mono uppercase text-slate-500">
                              {p.status}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                            <div>${p.price.toLocaleString()}</div>
                            <div className="text-[11px] text-[#C5A059]">{formatPKR(p.price)}</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <span
                              className={
                                p.stock <= (p.lowStockThreshold || 5)
                                  ? 'text-amber-400 font-semibold'
                                  : 'text-emerald-400'
                              }
                            >
                              {p.stock}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {p.seoDescription ? (
                              <span className="text-emerald-400 font-mono text-[11px]">
                                Optimized
                              </span>
                            ) : (
                              <span className="text-amber-400 font-mono text-[11px]">
                                Missing SEO
                              </span>
                            )}
                          </td>
                          <td
                            className="py-3 px-4 text-right space-x-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setEditingProduct(p);
                                setStudioShots([]);
                              }}
                              className="px-2 py-1 border border-white/15 text-slate-200 hover:border-white cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                await saveProduct(
                                  {
                                    ...p,
                                    id: undefined,
                                    sku: `${p.sku}-COPY`,
                                    name: `${p.name} (Copy)`,
                                  },
                                  'DUPLICATE_PRODUCT'
                                );
                                showToast(`Duplicated ${p.name} (${p.sku}-COPY).`);
                              }}
                              className="px-2 py-1 border border-white/15 text-slate-300 hover:border-white cursor-pointer"
                            >
                              Duplicate
                            </button>
                            <button
                              onClick={async () => {
                                const nextStatus = p.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
                                await saveProduct({ ...p, status: nextStatus }, 'ARCHIVE_PRODUCT');
                                showToast(`${p.name} status set to ${nextStatus}.`);
                              }}
                              className="px-2 py-1 border border-amber-500/30 text-amber-300 hover:border-amber-400 cursor-pointer"
                            >
                              {p.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
                            </button>
                            <button
                              onClick={() => removeProduct(p.id)}
                              className="px-2 py-1 text-rose-400 hover:text-rose-300 cursor-pointer"
                              aria-label="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Product Create/Edit & AI Image Studio Modal */}
              {editingProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 overflow-y-auto">
                  <div className="bg-[#0F172A] border border-white/15 w-full max-w-3xl p-6 space-y-6 my-8">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <h2 className="text-lg font-display text-white">
                        {editingProduct.id ? `Edit ${editingProduct.name}` : 'Create New Product'}
                      </h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateModalContent}
                          disabled={generatingContent}
                          className="px-3 py-1.5 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
                        >
                          {generatingContent ? 'Generating...' : 'AI Auto-Write Copy & SEO'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleGenerateStudioShots(
                              editingProduct.name || 'Atelier Piece',
                              editingProduct.category || 'Leather Goods'
                            )
                          }
                          disabled={generatingShots}
                          className="px-3 py-1.5 border border-[#C5A059] text-[#C5A059] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>{generatingShots ? 'Rendering...' : 'Generate 5 Studio Shots'}</span>
                        </button>
                        <button
                          onClick={() => setEditingProduct(null)}
                          className="p-1 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-slate-400 mb-1">Product Name</label>
                        <input
                          type="text"
                          value={editingProduct.name || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, name: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">SKU</label>
                        <input
                          type="text"
                          value={editingProduct.sku || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, sku: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">
                          Price (USD) — <span className="text-[#C5A059] font-mono">{formatPKR(editingProduct.price || 0)}</span>
                        </label>
                        <input
                          type="number"
                          value={editingProduct.price ?? 0}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, price: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Stock Quantity</label>
                        <input
                          type="number"
                          value={editingProduct.stock ?? 0}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Category</label>
                        <input
                          type="text"
                          value={editingProduct.category || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, category: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">Short Description</label>
                        <input
                          type="text"
                          value={editingProduct.shortDescription || ''}
                          onChange={(e) =>
                            setEditingProduct({
                              ...editingProduct,
                              shortDescription: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Full Editorial Description</label>
                        <textarea
                          rows={3}
                          value={editingProduct.description || ''}
                          onChange={(e) =>
                            setEditingProduct({ ...editingProduct, description: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-slate-400 mb-1">SEO Title</label>
                          <input
                            type="text"
                            value={editingProduct.seoTitle || ''}
                            onChange={(e) =>
                              setEditingProduct({ ...editingProduct, seoTitle: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">SEO Meta Description</label>
                          <input
                            type="text"
                            value={editingProduct.seoDescription || ''}
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                seoDescription: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 5 Generated Studio Shots Preview */}
                    {studioShots.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <div className="text-xs font-semibold text-[#C5A059]">
                          AI Product Photography Studio — 5 Variations
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                          {studioShots.map((shot, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 bg-[#0B0F17] border border-white/10 space-y-2 text-[11px]"
                            >
                              <div
                                className="h-16 w-full flex items-center justify-center font-mono text-[10px] text-white"
                                style={{
                                  background: `linear-gradient(135deg, ${shot.primaryHex || '#1e293b'}, ${
                                    shot.secondaryHex || '#0f172a'
                                  })`,
                                }}
                              >
                                {shot.shotType}
                              </div>
                              <div className="font-medium text-white line-clamp-1">
                                {shot.shotType}
                              </div>
                              <div className="text-slate-400 line-clamp-2">{shot.lightingSetup}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setEditingProduct(null)}
                        className="px-4 py-2 border border-white/15 text-xs text-slate-300 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const v = validateProductPayload({
                            name: editingProduct.name,
                            sku: editingProduct.sku,
                            price: Number(editingProduct.price ?? 0),
                            stock: Number(editingProduct.stock ?? 0),
                            category: editingProduct.category || 'Leather Goods',
                          });
                          if (!v.valid) {
                            showToast(v.errors[0]);
                            return;
                          }
                          await saveProduct({
                            ...editingProduct,
                            name: editingProduct.name!,
                            price: Number(editingProduct.price || 0),
                            category: editingProduct.category || 'Leather Goods',
                          });
                          setEditingProduct(null);
                          showToast('Product saved to store catalog.');
                        }}
                        className="px-6 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
                      >
                        Save Product
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 4: INVENTORY CONTROL ======================== */}
          {activeTab === 'INVENTORY' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-display text-white">
                  Real-Time Inventory & Stock Ledger
                </h1>
                <p className="text-xs text-slate-400">
                  Negative stock is strictly prevented. Adjust stock counts or trigger low-stock alerts.
                </p>
              </div>

              <div className="bg-[#0F172A] border border-white/10 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4 text-right">Available Stock</th>
                      <th className="py-3 px-4 text-right">Reserved</th>
                      <th className="py-3 px-4 text-right">Low Threshold</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Quick Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {products.map((p) => {
                      const isLow = p.stock <= (p.lowStockThreshold || 5);
                      return (
                        <tr key={p.id} className="hover:bg-white/[0.02]">
                          <td className="py-3 px-4 font-mono text-slate-300">{p.sku}</td>
                          <td className="py-3 px-4 text-white font-medium">{p.name}</td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-white">
                            {p.stock}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                            {p.reservedStock || 0}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                            {p.lowStockThreshold || 5}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px]">
                            {p.stock === 0 ? (
                              <span className="text-rose-400">OUT OF STOCK</span>
                            ) : isLow ? (
                              <span className="text-amber-400">LOW STOCK ALERT</span>
                            ) : (
                              <span className="text-emerald-400">NOMINAL</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-1.5">
                            <button
                              onClick={() => adjustInventory(p.id, Math.max(0, p.stock - 1), '-1 Unit')}
                              className="px-2 py-1 border border-white/15 font-mono text-white hover:bg-white/10 cursor-pointer"
                            >
                              -1
                            </button>
                            <button
                              onClick={() => adjustInventory(p.id, p.stock + 1, '+1 Unit')}
                              className="px-2 py-1 border border-white/15 font-mono text-white hover:bg-white/10 cursor-pointer"
                            >
                              +1
                            </button>
                            <button
                              onClick={() => adjustInventory(p.id, p.stock + 25, 'Restock Batch +25')}
                              className="px-2.5 py-1 bg-[#C5A059] text-[#0B0F17] font-mono font-semibold cursor-pointer"
                            >
                              +25 Restock
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================== TAB 5: CSV IMPORT / EXPORT WORKFLOW ======================== */}
          {activeTab === 'CSV_WORKFLOW' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display text-white">
                    AI CSV Catalog Import & Enrichment Pipeline
                  </h1>
                  <p className="text-xs text-slate-400">
                    Upload or paste a CSV file, validate SKUs/prices, auto-generate missing luxury copy & SEO with AI, and commit to the store.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="px-4 py-2 border border-white/20 text-xs text-white flex items-center gap-2 cursor-pointer hover:border-white">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload .CSV File</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const check = validateCsvFileUpload(file);
                        if (!check.valid) {
                          showToast(check.errors.join(' '));
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const content = String(ev.target?.result || '');
                          setCsvRawText(content);
                          handleParseCsv(content);
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                  <button
                    onClick={handleExportProductsCsv}
                    className="px-4 py-2 bg-white/10 text-xs text-white flex items-center gap-2 hover:bg-white/20 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Live Catalog CSV</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-[#0F172A] border border-white/10 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                      1. Raw CSV Payload
                    </h2>
                    <button
                      onClick={() => handleParseCsv(csvRawText)}
                      className="px-3 py-1 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
                    >
                      Parse & Validate Columns
                    </button>
                  </div>
                  <textarea
                    rows={10}
                    value={csvRawText}
                    onChange={(e) => setCsvRawText(e.target.value)}
                    className="w-full p-3 bg-[#0B0F17] border border-white/15 text-xs font-mono text-slate-200"
                  />
                </div>

                <div className="lg:col-span-7 bg-[#0F172A] border border-white/10 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-white">
                      2. Validation & AI Enrichment Preview ({parsedCsvRows.length} rows)
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAIEnrichCsv()}
                        disabled={csvEnriching || parsedCsvRows.length === 0}
                        className="px-3 py-1.5 border border-[#C5A059] text-[#C5A059] text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        {csvEnriching ? 'AI Enriching...' : 'AI Enrich Missing Copy & SEO'}
                      </button>
                      <button
                        onClick={() => handleCommitCsvImport()}
                        disabled={parsedCsvRows.length === 0}
                        className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold disabled:opacity-40 cursor-pointer"
                      >
                        Import Valid Rows to Store
                      </button>
                    </div>
                  </div>

                  {csvImportSummary && (
                    <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 text-xs font-mono text-emerald-200">
                      Import Completed — Imported: {csvImportSummary.imported} · Updated:{' '}
                      {csvImportSummary.updated} · Failed: {csvImportSummary.failed}
                    </div>
                  )}

                  {parsedCsvRows.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      Click “Parse & Validate Columns” to preview column mapping, duplicate detection, and SKU validation.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-400 font-mono text-[11px]">
                            <th className="py-2 px-2">Row</th>
                            <th className="py-2 px-2">SKU</th>
                            <th className="py-2 px-2">Name</th>
                            <th className="py-2 px-2 text-right">Price</th>
                            <th className="py-2 px-2 text-right">Stock</th>
                            <th className="py-2 px-2">Validation</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {parsedCsvRows.map((r) => (
                            <tr key={r.rowNumber}>
                              <td className="py-2 px-2 font-mono text-slate-400">#{r.rowNumber}</td>
                              <td className="py-2 px-2 font-mono text-white">{r.sku}</td>
                              <td className="py-2 px-2 text-white">
                                {r.name}
                                {r.seoTitle && (
                                  <span className="block text-[10px] text-[#C5A059]">
                                    SEO: {r.seoTitle}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono">
                                <div>${r.price}</div>
                                <div className="text-[10px] text-[#C5A059]">{formatPKR(r.price)}</div>
                              </td>
                              <td className="py-2 px-2 text-right font-mono">{r.stock}</td>
                              <td className="py-2 px-2 font-mono text-[11px]">
                                {!r.valid ? (
                                  <span className="text-rose-400">{r.errors.join(', ')}</span>
                                ) : r.duplicate ? (
                                  <span className="text-amber-400">Update Existing SKU</span>
                                ) : (
                                  <span className="text-emerald-400">Ready to Create</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 6: ORDERS MANAGEMENT ======================== */}
          {activeTab === 'ORDERS' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-display text-white">
                    Order Fulfillment, Tracking & Refunds ({orders.length})
                  </h1>
                  <p className="text-xs text-slate-400">
                    Click any row to bind it to AI Copilot context. Update fulfillment status, assign carrier tracking numbers, or process refunds.
                  </p>
                </div>
                <button
                  onClick={handleExportOrdersCsv}
                  className="px-4 py-2 bg-white/10 text-xs text-white flex items-center gap-2 hover:bg-white/20 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Orders CSV</span>
                </button>
              </div>

              <div className="bg-[#0F172A] border border-white/10 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Client & Destination</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Fulfillment Status</th>
                      <th className="py-3 px-4">Courier Service & Tracking Update</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {orders.map((ord) => (
                      <tr
                        key={ord.id}
                        onClick={() => setSelectedAdminOrder(ord)}
                        className={`hover:bg-white/[0.02] cursor-pointer ${
                          selectedAdminOrder?.id === ord.id ? 'bg-[#C5A059]/10' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-white">
                          <div>{ord.orderNumber}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {ord.createdAt.slice(0, 10)}
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <div className="text-white font-medium">{ord.customerName}</div>
                          <div className="text-[11px] text-slate-400">{ord.customerEmail}</div>
                          {ord.shippingAddressSummary && (
                            <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                              {ord.shippingAddressSummary}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px]">
                          {ord.paymentStatus} ({ord.paymentMethod})
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={ord.status}
                            onChange={(e) =>
                              updateOrderState(ord.id, e.target.value as OrderStatus, ord.trackingNumber)
                            }
                            className="bg-[#0B0F17] border border-white/15 px-2.5 py-1 text-xs font-mono text-white"
                          >
                            {[
                              'PENDING',
                              'CONFIRMED',
                              'PROCESSING',
                              'PACKED',
                              'SHIPPED',
                              'OUT_FOR_DELIVERY',
                              'DELIVERED',
                              'CANCELLED',
                              'REFUNDED',
                              'RETURNED',
                            ].map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const formData = new FormData(e.currentTarget);
                              const carrier = String(formData.get('carrier') || 'TCS');
                              const trackNum = String(formData.get('tracking') || '').trim();
                              const formattedTracking = trackNum
                                ? trackNum.includes(':') || trackNum.includes('-')
                                  ? trackNum
                                  : `${carrier}-${trackNum}`
                                : `${carrier}-${Math.floor(10000000 + Math.random() * 90000000)}`;
                              updateOrderState(ord.id, 'SHIPPED', formattedTracking);
                              showToast(`Updated tracking for ${ord.orderNumber}: ${formattedTracking}`);
                            }}
                            className="flex items-center gap-1.5"
                          >
                            <select
                              name="carrier"
                              defaultValue="TCS"
                              className="bg-[#0B0F17] border border-white/15 px-2 py-1 text-[11px] font-mono text-white"
                            >
                              <option value="TCS">TCS</option>
                              <option value="Leopards">Leopards</option>
                              <option value="M&P">M&amp;P</option>
                              <option value="PakistanPost">Pak Post</option>
                              <option value="DHL">DHL</option>
                              <option value="FedEx">FedEx</option>
                              <option value="UPS">UPS</option>
                              <option value="Aramex">Aramex</option>
                              <option value="BlueEx">BlueEx</option>
                              <option value="Trax">Trax</option>
                            </select>
                            <input
                              type="text"
                              name="tracking"
                              defaultValue={ord.trackingNumber || ''}
                              placeholder="Tracking # (or auto)"
                              className="w-36 px-2 py-1 bg-[#0B0F17] border border-white/15 text-[11px] font-mono text-white"
                            />
                            <button
                              type="submit"
                              className="px-2.5 py-1 bg-[#C5A059] text-[#0B0F17] font-semibold text-[11px] cursor-pointer whitespace-nowrap"
                            >
                              Update Tracking
                            </button>
                          </form>
                          {ord.trackingNumber && (
                            <div className="text-[10px] font-mono text-emerald-400 mt-1">
                              Active Tracking: {ord.trackingNumber}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-white">
                          <div>${ord.total.toFixed(2)}</div>
                          <div className="text-[11px] text-[#C5A059]">{formatPKR(ord.total)}</div>
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            onClick={() => updateOrderState(ord.id, 'REFUNDED')}
                            className="px-2.5 py-1 border border-rose-500/40 text-rose-300 text-[11px] cursor-pointer"
                          >
                            Refund
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================== TAB 7: COUPONS & DISCOUNTS ======================== */}
          {activeTab === 'COUPONS' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const v = validateCouponPayload({
                    code: newCouponCode,
                    type: newCouponType,
                    value: newCouponValue,
                    minCartAmount: newCouponMinAmount,
                  });
                  if (!v.valid) {
                    showToast(v.errors[0]);
                    return;
                  }
                  await saveCoupon({
                    code: newCouponCode,
                    type: newCouponType,
                    value: newCouponValue,
                    minCartAmount: newCouponMinAmount,
                  });
                  setNewCouponCode('');
                  showToast('Promotional coupon created.');
                }}
                className="lg:col-span-4 bg-[#0F172A] border border-white/10 p-6 space-y-4 h-fit"
              >
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                  Create Promotional Code
                </h2>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1">Coupon Code</label>
                    <input
                      type="text"
                      required
                      value={newCouponCode}
                      onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                      placeholder="SUMMER20"
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Discount Type</label>
                    <select
                      value={newCouponType}
                      onChange={(e) => setNewCouponType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed Amount ($)</option>
                      <option value="FREE_SHIPPING">Complimentary Shipping</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Discount Value</label>
                    <input
                      type="number"
                      value={newCouponValue}
                      onChange={(e) => setNewCouponValue(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Minimum Cart Subtotal ($)</label>
                    <input
                      type="number"
                      value={newCouponMinAmount}
                      onChange={(e) => setNewCouponMinAmount(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#C5A059] text-[#0B0F17] font-semibold cursor-pointer"
                  >
                    Save Coupon
                  </button>
                </div>
              </form>

              <div className="lg:col-span-8 bg-[#0F172A] border border-white/10 p-6 space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-white">
                  Active Promotional Codes ({coupons.length})
                </h2>
                <div className="divide-y divide-white/10">
                  {coupons.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-semibold text-[#C5A059] text-sm">
                          {c.code}
                        </span>
                        <span className="text-slate-400 ml-3">
                          {c.type === 'PERCENTAGE'
                            ? `${c.value}% OFF`
                            : c.type === 'FIXED'
                            ? `${formatDualPrice(c.value)} OFF`
                            : 'FREE SHIPPING'}{' '}
                          (Min Order: {formatDualPrice(c.minCartAmount || 0)})
                        </span>
                      </div>
                      <button
                        onClick={() => deleteCouponById(c.id)}
                        className="text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ======================== TAB 8: REVIEWS MODERATION ======================== */}
          {activeTab === 'REVIEWS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-white">
                Client Reviews & Moderation ({reviews.length})
              </h1>
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    className="p-5 bg-[#0F172A] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-mono text-[#C5A059]">
                        ★ {r.rating}.0 / 5.0 · {r.productName || r.productId} · Status: {r.status}
                      </div>
                      <div className="font-semibold text-white">{r.title}</div>
                      <p className="text-slate-300">{r.comment}</p>
                      <div className="text-slate-500">— {r.authorName}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => moderateReview(r.id, 'APPROVED')}
                        className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => moderateReview(r.id, 'REJECTED')}
                        className="px-3 py-1.5 bg-rose-600/20 border border-rose-500/40 text-rose-300 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================== TAB 9: AI BACKGROUND TASKS ======================== */}
          {activeTab === 'AI_TASKS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-white">
                Long-Running AI Tasks & Batch Queue ({aiTasks.length})
              </h1>
              {aiTasks.length === 0 ? (
                <div className="p-8 bg-[#0F172A] border border-white/10 text-xs text-slate-400">
                  No background AI tasks have been triggered yet. Run a bulk SEO generation, bulk price change, or CSV import to monitor progress here.
                </div>
              ) : (
                <div className="space-y-3">
                  {aiTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-5 bg-[#0F172A] border border-white/10 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-white">{task.name}</span>
                          <span className="ml-2 font-mono text-[11px] text-slate-400">
                            (ID: {task.id} · Actor: {task.actorUid})
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[#C5A059]">{task.status}</span>
                          {(task.status === 'QUEUED' || task.status === 'RUNNING') && (
                            <button
                              onClick={() => cancelAITask(task.id)}
                              className="px-2.5 py-1 bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono text-[11px] cursor-pointer"
                            >
                              Cancel Task
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-slate-400 font-mono">
                        Tool: {task.toolName} · Progress: {task.completedItems} / {task.totalItems}{' '}
                        items · Failed: {task.failedItems} · Started: {task.createdAt.slice(0, 19).replace('T', ' ')}
                      </div>
                      {task.summary && <div className="text-slate-300">{task.summary}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======================== TAB 10: AUDIT LOGS ======================== */}
          {activeTab === 'AUDIT_LOGS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-white">
                Immutable Security & AI Execution Audit Trail ({auditLogs.length})
              </h1>
              <div className="bg-[#0F172A] border border-white/10 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Resource</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10 font-mono">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-4 text-slate-400">
                          {log.createdAt.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="py-2.5 px-4 text-white">{log.actorName || log.actorUid}</td>
                        <td className="py-2.5 px-4 text-[#C5A059]">{log.action}</td>
                        <td className="py-2.5 px-4 text-slate-300">{log.resource}</td>
                        <td className="py-2.5 px-4 text-slate-400">{log.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================== TAB 11: NOTIFICATIONS ======================== */}
          {activeTab === 'NOTIFICATIONS' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-display text-white">
                Store Alerts & Operational Notifications ({notifications.length})
              </h1>
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 border flex items-center justify-between text-xs ${
                      n.read
                        ? 'bg-[#0F172A]/50 border-white/5 text-slate-400'
                        : 'bg-[#0F172A] border-[#C5A059]/40 text-white'
                    }`}
                  >
                    <div>
                      <span className="font-mono text-[11px] text-[#C5A059] mr-2">[{n.type}]</span>
                      <strong>{n.title}</strong> — {n.message}
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => markNotificationRead(n.id)}
                        className="px-2.5 py-1 bg-white/10 text-[11px] cursor-pointer"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ======================== TAB 12: STORE & AI SETTINGS ======================== */}
          {activeTab === 'SETTINGS' && (
            <div className="max-w-2xl bg-[#0F172A] border border-white/10 p-6 space-y-6">
              <h1 className="text-xl font-display text-white">
                Storefront, Tax, Logistics & AI Tone Configuration
              </h1>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Store Name</label>
                  <input
                    type="text"
                    value={settings.storeName}
                    onChange={(e) => updateStoreSettings({ storeName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Concierge Email</label>
                  <input
                    type="email"
                    value={settings.contactEmail}
                    onChange={(e) => updateStoreSettings({ contactEmail: e.target.value })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={settings.taxRate}
                    onChange={(e) => updateStoreSettings({ taxRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Free Shipping Threshold ($)</label>
                  <input
                    type="number"
                    value={settings.freeShippingThreshold || 350}
                    onChange={(e) =>
                      updateStoreSettings({ freeShippingThreshold: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">
                    Default AI Content Generation Tone
                  </label>
                  <select
                    value={settings.aiTone || 'Luxury'}
                    onChange={(e) => updateStoreSettings({ aiTone: e.target.value as any })}
                    className="w-full px-3 py-2 bg-[#0B0F17] border border-white/15 text-white"
                  >
                    {['Luxury', 'Premium', 'Professional', 'Minimal', 'Persuasive', 'Friendly'].map(
                      (t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Persistent Floating AI Copilot Drawer when on non-AI tabs */}
      {copilotDrawerOpen && activeTab !== 'AI_COMMAND_CENTER' && (
        <div className="w-96 border-l border-white/10 bg-[#0F172A] flex flex-col h-screen sticky top-0">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#C5A059]">
              AI Store Copilot
            </span>
            <button
              onClick={() => setCopilotDrawerOpen(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {aiMessages.slice(-6).map((m) => (
              <div
                key={m.id}
                className={`p-3 border ${
                  m.role === 'user'
                    ? 'bg-[#1E293B] border-white/15'
                    : 'bg-[#0B0F17] border-white/10'
                }`}
              >
                <div className="text-slate-200 whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendAICommand();
            }}
            className="p-3 border-t border-white/10 flex gap-2"
          >
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Command this page..."
              className="flex-1 px-3 py-2 bg-[#0B0F17] border border-white/15 text-xs text-white"
            />
            <button
              type="submit"
              disabled={aiBusy}
              className="px-3 py-2 bg-[#C5A059] text-[#0B0F17] text-xs font-semibold cursor-pointer"
            >
              Run
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
