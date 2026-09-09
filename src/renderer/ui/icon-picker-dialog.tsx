import {
  Activity,
  AlertCircle,
  Archive,
  Award,
  Banknote,
  BarChart,
  Bell,
  BookOpen,
  Bookmark,
  Box,
  Boxes,
  Briefcase,
  Building,
  Calculator,
  Calendar,
  Camera,
  Check,
  CheckCircle,
  CheckSquare,
  CircleDollarSign,
  Clipboard,
  Clock,
  Coffee,
  Coins,
  Columns,
  Compass,
  ContactRound,
  CreditCard,
  Crown,
  Database,
  DollarSign,
  File,
  FileSpreadsheet,
  FileText,
  Flame,
  Folder,
  Gift,
  Globe,
  Grid,
  Hammer,
  Hash,
  Heart,
  HelpCircle,
  Home,
  Info,
  Key,
  Landmark,
  Laptop,
  Layers,
  Layout,
  LineChart,
  List,
  ListTodo,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Monitor,
  Navigation,
  Package,
  PenTool,
  Percent,
  Phone,
  PieChart,
  PiggyBank,
  Printer,
  QrCode,
  Receipt,
  ReceiptText,
  RefreshCw,
  Rocket,
  Scan,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Sliders,
  Smartphone,
  Smile,
  Sparkles,
  Star,
  Store,
  Tablet,
  Tag,
  Tags,
  Target,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Truck,
  Undo,
  Unlock,
  User,
  UserCheck,
  Users,
  Wallet,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';

import type { Locale } from '../app/i18n';
import { PageIconRenderer } from './page-icon-renderer';

export const NOTION_ICON_COLORS = [
  { hex: 'e0e0e0', id: 'default', label: 'Default', labelAr: 'افتراضي' },
  { hex: '9b9a97', id: 'gray', label: 'Gray', labelAr: 'رمادي' },
  { hex: '937264', id: 'brown', label: 'Brown', labelAr: 'بني' },
  { hex: 'e8a24b', id: 'yellow', label: 'Yellow', labelAr: 'أصفر' },
  { hex: 'd9730d', id: 'orange', label: 'Orange', labelAr: 'برتقالي' },
  { hex: '4d9b68', id: 'green', label: 'Green', labelAr: 'أخضر' },
  { hex: '337ea9', id: 'blue', label: 'Blue', labelAr: 'أزرق' },
  { hex: '9065b0', id: 'purple', label: 'Purple', labelAr: 'بنفسجي' },
  { hex: 'c14c8a', id: 'pink', label: 'Pink', labelAr: 'وردي' },
  { hex: 'd44c47', id: 'red', label: 'Red', labelAr: 'أحمر' },
] as const;

type IconPickerDialogProps = Readonly<{
  currentIcon?: string;
  locale: Locale;
  onClose: () => void;
  onSelect: (icon: string) => void;
}>;

type LucideItem = {
  category: 'commerce' | 'finance' | 'general' | 'objects' | 'people' | 'productivity' | 'tech';
  icon: LucideIcon;
  id: string; // e.g. 'lucide:Package'
  name: string;
  tags: readonly string[];
};

type EmojiItem = {
  category: 'activities' | 'food' | 'nature' | 'objects' | 'people' | 'smileys' | 'symbols' | 'travel';
  char: string;
  name: string;
  tags: readonly string[];
};

const LUCIDE_CATALOG: readonly LucideItem[] = [
  // Commerce & Shop
  { category: 'commerce', icon: Store, id: 'lucide:Store', name: 'Store', tags: ['shop', 'store', 'retail', 'market', 'متجر', 'محل', 'سوق'] },
  { category: 'commerce', icon: ShoppingBag, id: 'lucide:ShoppingBag', name: 'Shopping Bag', tags: ['bag', 'buy', 'purchase', 'حقيبة', 'شراء'] },
  { category: 'commerce', icon: ShoppingCart, id: 'lucide:ShoppingCart', name: 'Shopping Cart', tags: ['cart', 'trolley', 'سلة', 'عربة'] },
  { category: 'commerce', icon: Package, id: 'lucide:Package', name: 'Package', tags: ['item', 'product', 'box', 'صنف', 'طرد', 'منتج'] },
  { category: 'commerce', icon: Box, id: 'lucide:Box', name: 'Box', tags: ['box', 'storage', 'inventory', 'صندوق', 'مخزون'] },
  { category: 'commerce', icon: Boxes, id: 'lucide:Boxes', name: 'Boxes', tags: ['inventory', 'stock', 'warehouse', 'مخزن', 'بضاعة'] },
  { category: 'commerce', icon: Tag, id: 'lucide:Tag', name: 'Tag', tags: ['price', 'label', 'discount', 'سعر', 'وسم', 'تخفيض'] },
  { category: 'commerce', icon: Tags, id: 'lucide:Tags', name: 'Tags', tags: ['categories', 'labels', 'تصنيفات'] },
  { category: 'commerce', icon: Percent, id: 'lucide:Percent', name: 'Percent', tags: ['discount', 'sale', 'offer', 'نسبة', 'خصم', 'عروض'] },
  { category: 'commerce', icon: Truck, id: 'lucide:Truck', name: 'Delivery Truck', tags: ['shipping', 'delivery', 'transport', 'شحن', 'توصيل'] },
  { category: 'commerce', icon: QrCode, id: 'lucide:QrCode', name: 'QR Code', tags: ['barcode', 'scan', 'باركود', 'كود'] },
  { category: 'commerce', icon: Scan, id: 'lucide:Scan', name: 'Barcode Scan', tags: ['scanner', 'reader', 'قارئ', 'مسح'] },

  // Finance & Money
  { category: 'finance', icon: CircleDollarSign, id: 'lucide:CircleDollarSign', name: 'Dollar Coin', tags: ['money', 'cash', 'dollar', 'نقود', 'دولار', 'مال'] },
  { category: 'finance', icon: DollarSign, id: 'lucide:DollarSign', name: 'Dollar Sign', tags: ['currency', 'عملة'] },
  { category: 'finance', icon: Wallet, id: 'lucide:Wallet', name: 'Wallet', tags: ['drawer', 'purse', 'safe', 'محفظة', 'خزينة'] },
  { category: 'finance', icon: CreditCard, id: 'lucide:CreditCard', name: 'Credit Card', tags: ['payment', 'visa', 'card', 'بطاقة', 'دفع'] },
  { category: 'finance', icon: Receipt, id: 'lucide:Receipt', name: 'Receipt', tags: ['invoice', 'bill', 'فاتورة', 'إيصال'] },
  { category: 'finance', icon: ReceiptText, id: 'lucide:ReceiptText', name: 'Transaction Receipt', tags: ['ledger', 'accounting', 'حسابات', 'معاملة'] },
  { category: 'finance', icon: Coins, id: 'lucide:Coins', name: 'Coins', tags: ['change', 'cash', 'عملات', 'فكة'] },
  { category: 'finance', icon: Banknote, id: 'lucide:Banknote', name: 'Banknote', tags: ['paper cash', 'اوراق نقدية'] },
  { category: 'finance', icon: Landmark, id: 'lucide:Landmark', name: 'Bank', tags: ['bank', 'institution', 'بنك', 'مصرف'] },
  { category: 'finance', icon: PiggyBank, id: 'lucide:PiggyBank', name: 'Piggy Bank', tags: ['savings', 'deposit', 'توفير', 'ادخار'] },
  { category: 'finance', icon: Calculator, id: 'lucide:Calculator', name: 'Calculator', tags: ['math', 'calculate', 'حاسبة', 'حساب'] },
  { category: 'finance', icon: BarChart, id: 'lucide:BarChart', name: 'Bar Chart', tags: ['analytics', 'revenue', 'مبيعات', 'تقرير'] },
  { category: 'finance', icon: LineChart, id: 'lucide:LineChart', name: 'Line Chart', tags: ['growth', 'trend', 'نمو'] },
  { category: 'finance', icon: PieChart, id: 'lucide:PieChart', name: 'Pie Chart', tags: ['distribution', 'نسب'] },
  { category: 'finance', icon: TrendingUp, id: 'lucide:TrendingUp', name: 'Trending Up', tags: ['profit', 'increase', 'أرباح', 'ارتفاع'] },
  { category: 'finance', icon: TrendingDown, id: 'lucide:TrendingDown', name: 'Trending Down', tags: ['loss', 'decrease', 'خسارة', 'انخفاض'] },

  // People & Customers
  { category: 'people', icon: User, id: 'lucide:User', name: 'User', tags: ['person', 'customer', 'عميل', 'شخص'] },
  { category: 'people', icon: Users, id: 'lucide:Users', name: 'Users', tags: ['team', 'people', 'customers', 'عملاء', 'موردين', 'فريق'] },
  { category: 'people', icon: ContactRound, id: 'lucide:ContactRound', name: 'Contact', tags: ['client', 'supplier', 'جهة اتصال'] },
  { category: 'people', icon: UserCheck, id: 'lucide:UserCheck', name: 'Verified User', tags: ['approved', 'member', 'مفعل'] },
  { category: 'people', icon: Briefcase, id: 'lucide:Briefcase', name: 'Briefcase', tags: ['work', 'job', 'business', 'عمل', 'وظيفة'] },
  { category: 'people', icon: Building, id: 'lucide:Building', name: 'Company', tags: ['company', 'firm', 'supplier', 'شركة', 'مؤسسة'] },

  // Productivity & Documents
  { category: 'productivity', icon: FileText, id: 'lucide:FileText', name: 'Document', tags: ['page', 'notes', 'doc', 'مستند', 'صفحة', 'ملاحظات'] },
  { category: 'productivity', icon: File, id: 'lucide:File', name: 'File', tags: ['file', 'ملف'] },
  { category: 'productivity', icon: FileSpreadsheet, id: 'lucide:FileSpreadsheet', name: 'Spreadsheet', tags: ['excel', 'sheet', 'جدول'] },
  { category: 'productivity', icon: Folder, id: 'lucide:Folder', name: 'Folder', tags: ['directory', 'مجلد'] },
  { category: 'productivity', icon: Archive, id: 'lucide:Archive', name: 'Archive', tags: ['archived', 'أرشيف'] },
  { category: 'productivity', icon: Database, id: 'lucide:Database', name: 'Database', tags: ['db', 'records', 'بيانات', 'قاعدة'] },
  { category: 'productivity', icon: ListTodo, id: 'lucide:ListTodo', name: 'Tasks', tags: ['todo', 'checklist', 'مهام', 'قائمة'] },
  { category: 'productivity', icon: Clipboard, id: 'lucide:Clipboard', name: 'Clipboard', tags: ['board', 'لوح'] },
  { category: 'productivity', icon: CheckSquare, id: 'lucide:CheckSquare', name: 'Checklist', tags: ['done', 'تم'] },
  { category: 'productivity', icon: BookOpen, id: 'lucide:BookOpen', name: 'Book', tags: ['guide', 'manual', 'كتيب', 'دليل'] },
  { category: 'productivity', icon: Bookmark, id: 'lucide:Bookmark', name: 'Bookmark', tags: ['favorite', 'إشارة'] },
  { category: 'productivity', icon: Calendar, id: 'lucide:Calendar', name: 'Calendar', tags: ['date', 'schedule', 'تقويم', 'موعد'] },
  { category: 'productivity', icon: Clock, id: 'lucide:Clock', name: 'Clock', tags: ['time', 'ساعة', 'وقت'] },
  { category: 'productivity', icon: Timer, id: 'lucide:Timer', name: 'Timer', tags: ['countdown', 'مؤقت'] },
  { category: 'productivity', icon: Layout, id: 'lucide:Layout', name: 'Layout', tags: ['dashboard', 'تخطيط'] },
  { category: 'productivity', icon: List, id: 'lucide:List', name: 'List', tags: ['items', 'قائمة'] },
  { category: 'productivity', icon: Check, id: 'lucide:Check', name: 'Check', tags: ['check', 'mark', 'علامة', 'صح'] },
  { category: 'productivity', icon: CheckCircle, id: 'lucide:CheckCircle', name: 'Check Circle', tags: ['done', 'تم', 'مكتمل'] },
  { category: 'productivity', icon: Layers, id: 'lucide:Layers', name: 'Layers', tags: ['stack', 'طبقات'] },
  { category: 'productivity', icon: Columns, id: 'lucide:Columns', name: 'Columns', tags: ['split', 'أعمدة'] },
  { category: 'productivity', icon: Grid, id: 'lucide:Grid', name: 'Grid', tags: ['blocks', 'شبكة'] },

  // Tech & Devices
  { category: 'tech', icon: Smartphone, id: 'lucide:Smartphone', name: 'Smartphone', tags: ['mobile', 'phone', 'هاتف', 'جوال'] },
  { category: 'tech', icon: Laptop, id: 'lucide:Laptop', name: 'Laptop', tags: ['computer', 'كمبيوتر', 'لابتوب'] },
  { category: 'tech', icon: Monitor, id: 'lucide:Monitor', name: 'Desktop Monitor', tags: ['screen', 'شاشة'] },
  { category: 'tech', icon: Tablet, id: 'lucide:Tablet', name: 'Tablet', tags: ['ipad', 'تابلت'] },
  { category: 'tech', icon: Camera, id: 'lucide:Camera', name: 'Camera', tags: ['photo', 'picture', 'كاميرا', 'صورة'] },
  { category: 'tech', icon: Printer, id: 'lucide:Printer', name: 'Printer', tags: ['print', 'طباعة', 'طابعة'] },
  { category: 'tech', icon: Globe, id: 'lucide:Globe', name: 'Globe', tags: ['web', 'internet', 'موقع', 'انترنت'] },
  { category: 'tech', icon: Key, id: 'lucide:Key', name: 'Key', tags: ['password', 'access', 'مفتاح', 'دخول'] },
  { category: 'tech', icon: Lock, id: 'lucide:Lock', name: 'Lock', tags: ['security', 'قفل', 'أمان'] },
  { category: 'tech', icon: Unlock, id: 'lucide:Unlock', name: 'Unlock', tags: ['open', 'مفتوح'] },
  { category: 'tech', icon: Shield, id: 'lucide:Shield', name: 'Shield', tags: ['protect', 'حماية'] },
  { category: 'tech', icon: ShieldCheck, id: 'lucide:ShieldCheck', name: 'Verified Shield', tags: ['safe', 'موثوق'] },

  // Objects & Tools
  { category: 'objects', icon: Hammer, id: 'lucide:Hammer', name: 'Hammer', tags: ['tool', 'build', 'مطرقة', 'بناء'] },
  { category: 'objects', icon: Wrench, id: 'lucide:Wrench', name: 'Wrench', tags: ['fix', 'repair', 'مفتاح', 'تصليح'] },
  { category: 'objects', icon: PenTool, id: 'lucide:PenTool', name: 'Pen Tool', tags: ['design', 'edit', 'قلم', 'تصميم'] },
  { category: 'objects', icon: Hash, id: 'lucide:Hash', name: 'Hash', tags: ['tag', 'number', 'هاشتاج', 'رمز'] },
  { category: 'objects', icon: Trash2, id: 'lucide:Trash2', name: 'Trash', tags: ['delete', 'remove', 'سلة', 'حذف'] },

  // General & Highlights
  { category: 'general', icon: Home, id: 'lucide:Home', name: 'Home', tags: ['main', 'الرئيسية', 'بيت'] },
  { category: 'general', icon: Star, id: 'lucide:Star', name: 'Star', tags: ['favorite', 'rating', 'نجمة', 'مميز'] },
  { category: 'general', icon: Sparkles, id: 'lucide:Sparkles', name: 'Sparkles', tags: ['magic', 'ai', 'new', 'بريق', 'جديد', 'مميز'] },
  { category: 'general', icon: Flame, id: 'lucide:Flame', name: 'Flame', tags: ['fire', 'hot', 'popular', 'نار', 'شائع', 'حار'] },
  { category: 'general', icon: Zap, id: 'lucide:Zap', name: 'Flash', tags: ['fast', 'quick', 'سريع', 'برق'] },
  { category: 'general', icon: Activity, id: 'lucide:Activity', name: 'Activity', tags: ['pulse', 'health', 'نشاط', 'حركة'] },
  { category: 'general', icon: AlertCircle, id: 'lucide:AlertCircle', name: 'Alert', tags: ['warning', 'notice', 'تنبيه', 'تحذير'] },
  { category: 'general', icon: Info, id: 'lucide:Info', name: 'Info', tags: ['information', 'معلومات', 'إرشاد'] },
  { category: 'general', icon: HelpCircle, id: 'lucide:HelpCircle', name: 'Help', tags: ['question', 'support', 'مساعدة', 'سؤال'] },
  { category: 'general', icon: Compass, id: 'lucide:Compass', name: 'Compass', tags: ['explore', 'بوصلة', 'استكشاف'] },
  { category: 'general', icon: Navigation, id: 'lucide:Navigation', name: 'Navigation', tags: ['guide', 'ملاحة', 'توجيه'] },
  { category: 'general', icon: RefreshCw, id: 'lucide:RefreshCw', name: 'Refresh', tags: ['sync', 'update', 'تحديث', 'مزامنة'] },
  { category: 'general', icon: Undo, id: 'lucide:Undo', name: 'Undo', tags: ['revert', 'تراجع'] },
  { category: 'general', icon: Rocket, id: 'lucide:Rocket', name: 'Rocket', tags: ['launch', 'fast', 'صاروخ', 'انطلاق'] },
  { category: 'general', icon: Target, id: 'lucide:Target', name: 'Target', tags: ['goal', 'focus', 'هدف', 'تركيز'] },
  { category: 'general', icon: Trophy, id: 'lucide:Trophy', name: 'Trophy', tags: ['achievement', 'كأس', 'إنجاز'] },
  { category: 'general', icon: Crown, id: 'lucide:Crown', name: 'Crown', tags: ['vip', 'premium', 'تاج', 'مميز'] },
  { category: 'general', icon: Award, id: 'lucide:Award', name: 'Award', tags: ['badge', 'وسام'] },
  { category: 'general', icon: Heart, id: 'lucide:Heart', name: 'Heart', tags: ['love', 'like', 'قلب'] },
  { category: 'general', icon: Smile, id: 'lucide:Smile', name: 'Smile', tags: ['happy', 'ابتسامة'] },
  { category: 'general', icon: Coffee, id: 'lucide:Coffee', name: 'Coffee', tags: ['drink', 'break', 'قهوة', 'استراحة'] },
  { category: 'general', icon: Gift, id: 'lucide:Gift', name: 'Gift', tags: ['present', 'هدية'] },
  { category: 'general', icon: Bell, id: 'lucide:Bell', name: 'Bell', tags: ['notification', 'alert', 'إشعار', 'تنبيه'] },
  { category: 'general', icon: Phone, id: 'lucide:Phone', name: 'Phone', tags: ['call', 'اتصال'] },
  { category: 'general', icon: Mail, id: 'lucide:Mail', name: 'Mail', tags: ['email', 'بريد'] },
  { category: 'general', icon: MessageSquare, id: 'lucide:MessageSquare', name: 'Message', tags: ['chat', 'رسالة'] },
  { category: 'general', icon: MapPin, id: 'lucide:MapPin', name: 'Map Pin', tags: ['location', 'address', 'موقع', 'عنوان'] },
  { category: 'general', icon: Settings, id: 'lucide:Settings', name: 'Settings', tags: ['gear', 'config', 'إعدادات'] },
  { category: 'general', icon: Sliders, id: 'lucide:Sliders', name: 'Preferences', tags: ['controls', 'خيارات'] },
];

const EMOJI_CATALOG: readonly EmojiItem[] = [
  // Commerce & Finance
  { category: 'objects', char: '📦', name: 'Package', tags: ['box', 'delivery', 'stock', 'طرد', 'صندوق', 'بضاعة'] },
  { category: 'objects', char: '🛒', name: 'Shopping Cart', tags: ['cart', 'buy', 'سلة', 'تسوق'] },
  { category: 'objects', char: '🛍️', name: 'Shopping Bags', tags: ['bags', 'shopping', 'أكياس'] },
  { category: 'objects', char: '🏷️', name: 'Label Tag', tags: ['tag', 'price', 'بطاقة', 'سعر'] },
  { category: 'objects', char: '💰', name: 'Money Bag', tags: ['money', 'cash', 'مال', 'كيس نقود'] },
  { category: 'objects', char: '💳', name: 'Credit Card', tags: ['card', 'payment', 'بطاقة', 'فيزا'] },
  { category: 'objects', char: '💵', name: 'Dollar Banknote', tags: ['cash', 'currency', 'دولار', 'كاش'] },
  { category: 'objects', char: '🪙', name: 'Coin', tags: ['coin', 'change', 'عملة', 'فكة'] },
  { category: 'objects', char: '🧾', name: 'Receipt', tags: ['bill', 'invoice', 'إيصال', 'فاتورة'] },
  { category: 'objects', char: '💎', name: 'Gem Stone', tags: ['diamond', 'valuable', 'جوهرة', 'ألماس'] },
  { category: 'objects', char: '🏢', name: 'Office Building', tags: ['company', 'building', 'مبنى', 'شركة'] },
  { category: 'objects', char: '🏪', name: 'Convenience Store', tags: ['shop', 'store', 'محل', 'بقالة'] },

  // Tech & Objects
  { category: 'objects', char: '📱', name: 'Mobile Phone', tags: ['phone', 'iphone', 'جوال', 'هاتف'] },
  { category: 'objects', char: '💻', name: 'Laptop', tags: ['macbook', 'pc', 'كمبيوتر', 'لابتوب'] },
  { category: 'objects', char: '🖥️', name: 'Desktop', tags: ['monitor', 'شاشة'] },
  { category: 'objects', char: '🖨️', name: 'Printer', tags: ['print', 'طابعة'] },
  { category: 'objects', char: '📸', name: 'Camera', tags: ['photo', 'كاميرا'] },
  { category: 'objects', char: '🎧', name: 'Headphones', tags: ['audio', 'سماعات'] },
  { category: 'objects', char: '🔧', name: 'Wrench', tags: ['tool', 'repair', 'مفتاح', 'صيانة'] },
  { category: 'objects', char: '🔨', name: 'Hammer', tags: ['build', 'مطرقة'] },
  { category: 'objects', char: '🔑', name: 'Key', tags: ['lock', 'مفتاح'] },
  { category: 'objects', char: '🔒', name: 'Lock', tags: ['secure', 'قفل'] },

  // Productivity & Office
  { category: 'objects', char: '📄', name: 'Document', tags: ['file', 'page', 'ورقة', 'مستند'] },
  { category: 'objects', char: '📝', name: 'Memo Note', tags: ['write', 'edit', 'ملاحظة', 'كتابة'] },
  { category: 'objects', char: '📁', name: 'Folder', tags: ['directory', 'مجلد'] },
  { category: 'objects', char: '📊', name: 'Bar Chart', tags: ['analytics', 'sales', 'رسم بياني', 'مبيعات'] },
  { category: 'objects', char: '📈', name: 'Chart Increasing', tags: ['growth', 'profit', 'نمو', 'أرباح'] },
  { category: 'objects', char: '📉', name: 'Chart Decreasing', tags: ['loss', 'خسارة'] },
  { category: 'objects', char: '📋', name: 'Clipboard', tags: ['checklist', 'مهام'] },
  { category: 'objects', char: '📅', name: 'Calendar', tags: ['date', 'تقويم'] },
  { category: 'objects', char: '📌', name: 'Pushpin', tags: ['pin', 'مسمار', 'تثبيت'] },
  { category: 'objects', char: '🔍', name: 'Magnifying Glass', tags: ['search', 'بحث'] },
  { category: 'objects', char: '💡', name: 'Light Bulb', tags: ['idea', 'tip', 'فكرة', 'ملاحظة'] },
  { category: 'objects', char: '⭐', name: 'Star', tags: ['favorite', 'نجمة'] },
  { category: 'objects', char: '✨', name: 'Sparkles', tags: ['magic', 'new', 'بريق', 'جديد'] },
  { category: 'objects', char: '🔥', name: 'Fire', tags: ['hot', 'flame', 'نار', 'مميز'] },
  { category: 'objects', char: '🚀', name: 'Rocket', tags: ['launch', 'fast', 'صاروخ'] },
  { category: 'objects', char: '🎯', name: 'Bullseye', tags: ['target', 'goal', 'هدف'] },
  { category: 'objects', char: '🏆', name: 'Trophy', tags: ['winner', 'كأس'] },
  { category: 'objects', char: '👑', name: 'Crown', tags: ['vip', 'king', 'تاج'] },
  { category: 'objects', char: '☕', name: 'Hot Beverage', tags: ['coffee', 'tea', 'قهوة', 'شاي'] },
  { category: 'objects', char: '🏠', name: 'House', tags: ['home', 'منزل', 'الرئيسية'] },

  // Smileys & People
  { category: 'smileys', char: '😀', name: 'Grinning Face', tags: ['happy', 'ابتسامة', 'فرح'] },
  { category: 'smileys', char: '😎', name: 'Smiling Face with Sunglasses', tags: ['cool', 'رائع'] },
  { category: 'smileys', char: '🤝', name: 'Handshake', tags: ['deal', 'agreement', 'اتفاق', 'مصافحة'] },
  { category: 'people', char: '👥', name: 'Busts in Silhouette', tags: ['people', 'users', 'team', 'أشخاص', 'فريق'] },
  { category: 'people', char: '👤', name: 'Bust in Silhouette', tags: ['user', 'person', 'شخص'] },
  { category: 'people', char: '👨‍💼', name: 'Office Worker', tags: ['businessman', 'موظف'] },
];

const RECENT_ICONS_KEY = 'max:recent_icons';

const LAST_COLOR_KEY = 'max:last_selected_icon_color';

function loadRecentIcons(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ICONS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string').slice(0, 12);
      }
    }
  } catch {
    // fallback
  }
  return [];
}

function saveRecentIcon(iconId: string): void {
  try {
    const current = loadRecentIcons().filter((i) => i !== iconId);
    const updated = [iconId, ...current].slice(0, 12);
    window.localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function IconPickerDialog({
  currentIcon = '',
  locale,
  onClose,
  onSelect,
}: IconPickerDialogProps) {
  // Extract initial color if currentIcon has #hex or load saved preference
  const initialColor = useMemo(() => {
    if (currentIcon.includes('#')) {
      return currentIcon.split('#')[1] ?? 'e0e0e0';
    }
    try {
      return window.localStorage.getItem(LAST_COLOR_KEY) || 'e0e0e0';
    } catch {
      return 'e0e0e0';
    }
  }, [currentIcon]);

  const [activeTab, setActiveTab] = useState<'emojis' | 'icons'>('icons');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(initialColor);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [recentIcons, setRecentIcons] = useState<readonly string[]>(() => loadRecentIcons());

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSelectIcon = useCallback((iconString: string) => {
    saveRecentIcon(iconString);
    setRecentIcons(loadRecentIcons());
    onSelect(iconString);
    onClose();
  }, [onClose, onSelect]);

  const [emojiCatalog, setEmojiCatalog] = useState<readonly EmojiItem[]>(EMOJI_CATALOG);
  const lucideCatalog: readonly LucideItem[] = LUCIDE_CATALOG;

  useEffect(() => {
    let mounted = true;
    import('./emoji-data.json').then((module) => {
      if (mounted && module.default) {
        setEmojiCatalog(module.default as unknown as EmojiItem[]);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const handleShuffle = useCallback(() => {
    if (activeTab === 'icons') {
      const randomIdx = Math.floor(Math.random() * lucideCatalog.length);
      const chosen = lucideCatalog[randomIdx];
      if (chosen) {
        const finalId = selectedColor && selectedColor !== 'e0e0e0' ? `${chosen.id}#${selectedColor}` : chosen.id;
        handleSelectIcon(finalId);
      }
    } else {
      const randomIdx = Math.floor(Math.random() * emojiCatalog.length);
      const chosen = emojiCatalog[randomIdx];
      if (chosen) {
        handleSelectIcon(chosen.char);
      }
    }
  }, [activeTab, handleSelectIcon, selectedColor, lucideCatalog, emojiCatalog]);

  const filteredEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return emojiCatalog;
    return emojiCatalog.filter((item) => (
      item.char === q ||
      item.name.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q))
    ));
  }, [searchQuery, emojiCatalog]);

  const filteredLucide = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return lucideCatalog;
    return lucideCatalog.filter((item) => (
      item.name.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q))
    ));
  }, [searchQuery, lucideCatalog]);

  const [renderLimit, setRenderLimit] = useState(150);
  useEffect(() => { setRenderLimit(150); }, [activeTab, searchQuery]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      setRenderLimit((prev) => prev + 150);
    }
  }, []);

  return (
    <>
      <div
        ref={popoverRef}
        aria-label={locale === 'ar' ? 'اختيار الرمز' : 'Select Icon'}
        aria-modal="true"
        className="icon-picker-popover"
        role="dialog"
      >
        {/* Top Tab Switcher & Remove Link (Notion style) */}
        <div className="icon-picker-popover__nav">
          <div className="icon-picker-popover__tabs">
            <button
              className="icon-picker-popover__tab"
              data-active={activeTab === 'emojis'}
              onClick={() => {
                setActiveTab('emojis');
                setColorPickerOpen(false);
              }}
              type="button"
            >
              <span>{locale === 'ar' ? 'الإيموجي' : 'Emoji'}</span>
            </button>
            <button
              className="icon-picker-popover__tab"
              data-active={activeTab === 'icons'}
              onClick={() => setActiveTab('icons')}
              type="button"
            >
              <span>{locale === 'ar' ? 'الأيقونات' : 'Icons'}</span>
            </button>
          </div>

          {currentIcon && (
            <button
              className="icon-picker-popover__remove-btn"
              onClick={() => {
                onSelect('');
                onClose();
              }}
              type="button"
            >
              {locale === 'ar' ? 'إزالة' : 'Remove'}
            </button>
          )}
        </div>

        {/* Search & Tool Bar: Filter Input + Shuffle + Color Picker Trigger */}
        <div className="icon-picker-popover__search-bar">
          <div className="icon-picker-popover__input-wrap">
            <Search className="icon-picker-popover__search-icon" size={13} />
            <input
              autoFocus
              className="icon-picker-popover__input"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={locale === 'ar' ? 'ابحث...' : 'Filter...'}
              value={searchQuery}
            />
            {searchQuery && (
              <button
                aria-label="Clear filter"
                className="icon-picker-popover__clear-btn"
                onClick={() => setSearchQuery('')}
                type="button"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            aria-label="Random icon"
            className="icon-picker-popover__tool-btn"
            onClick={handleShuffle}
            title={locale === 'ar' ? 'رمز عشوائي' : 'Random icon'}
            type="button"
          >
            <Shuffle size={14} />
          </button>

          {activeTab === 'icons' && (
            <button
              aria-expanded={colorPickerOpen}
              aria-label="Choose icon color"
              className="icon-picker-popover__color-trigger"
              onClick={() => setColorPickerOpen((open) => !open)}
              title={locale === 'ar' ? 'تغيير اللون' : 'Icon color'}
              type="button"
            >
              <span
                className="icon-picker-popover__color-dot"
                style={{ backgroundColor: `#${selectedColor}` }}
              />
            </button>
          )}
        </div>

        {/* Color Swatch Dropdown (10 Notion Colors) */}
        {colorPickerOpen && activeTab === 'icons' && (
          <div className="icon-picker-popover__color-grid">
            {NOTION_ICON_COLORS.map((col) => {
              const isSelected = selectedColor === col.hex;
              return (
                <button
                  key={col.id}
                  aria-label={locale === 'ar' ? col.labelAr : col.label}
                  className="icon-picker-popover__color-btn"
                  data-selected={isSelected}
                  onClick={() => {
                    setSelectedColor(col.hex);
                    try {
                      window.localStorage.setItem(LAST_COLOR_KEY, col.hex);
                    } catch {
                      // ignore
                    }
                    setColorPickerOpen(false);
                  }}
                  title={locale === 'ar' ? col.labelAr : col.label}
                  type="button"
                >
                  <span
                    className="icon-picker-popover__swatch"
                    style={{ backgroundColor: `#${col.hex}` }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Popover Content */}
        <div className="icon-picker-popover__body" onScroll={handleScroll}>
          {/* Recent Section (shown when no search query) */}
          {!searchQuery && recentIcons.length > 0 && (
            <div className="icon-picker-popover__section">
              <span className="icon-picker-popover__section-title">
                {locale === 'ar' ? 'الأخيرة' : 'Recent'}
              </span>
              <div className="icon-picker-popover__grid">
                {recentIcons.map((rec) => (
                  <button
                    key={rec}
                    className="icon-picker-popover__tile"
                    onClick={() => handleSelectIcon(rec)}
                    type="button"
                  >
                    <PageIconRenderer icon={rec} size={17} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main Catalog */}
          <div className="icon-picker-popover__section">
            {!searchQuery && (
              <span className="icon-picker-popover__section-title">
                {activeTab === 'icons' ? (locale === 'ar' ? 'الأيقونات' : 'Icons') : (locale === 'ar' ? 'الإيموجي' : 'Emoji')}
              </span>
            )}

            {activeTab === 'icons' ? (
              filteredLucide.length > 0 ? (
                <div className="icon-picker-popover__grid">
                  {filteredLucide.slice(0, renderLimit).map((item) => {
                    const IconComp = item.icon;
                    const fullIconId = selectedColor && selectedColor !== 'e0e0e0' ? `${item.id}#${selectedColor}` : item.id;
                    const isSelected = currentIcon === fullIconId || currentIcon === item.id;
                    return (
                      <button
                        key={item.id}
                        className="icon-picker-popover__tile"
                        data-selected={isSelected}
                        onClick={() => handleSelectIcon(fullIconId)}
                        title={item.name}
                        type="button"
                      >
                        <IconComp size={17} strokeWidth={1.8} style={{ color: `#${selectedColor}` }} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="icon-picker-popover__empty">
                  {locale === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching icons'}
                </div>
              )
            ) : filteredEmojis.length > 0 ? (
              <div className="icon-picker-popover__grid">
                {filteredEmojis.slice(0, renderLimit).map((item) => {
                  const isSelected = currentIcon === item.char;
                  return (
                    <button
                      key={item.char}
                      className="icon-picker-popover__tile"
                      data-selected={isSelected}
                      onClick={() => handleSelectIcon(item.char)}
                      title={item.name}
                      type="button"
                    >
                      <span className="icon-picker-popover__emoji-char">{item.char}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="icon-picker-popover__empty">
                {locale === 'ar' ? 'لا توجد نتائج مطابقة' : 'No matching emojis'}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
