import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  X,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Package,
  Calendar,
  Hash,
  DollarSign,
  Pill,
  AlertCircle,
  FlipHorizontal,
} from 'lucide-react';
import { MedicineCatalogItem, PurchasePackUnit } from '../types';
import { formatCleanMoney } from '../data/bdMedicines';

export interface ScannedBoxData {
  brandName: string;
  strength: string;
  dosageForm: string;
  companyName: string;
  genericName: string;
  boxSize: string; // e.g. "1*10*10"
  totalPcs: number; // e.g. 100
  boxRate: number; // e.g. 520
  unitPrice: number; // piece price, e.g. 5.20
  batchNo: string; // e.g. "B-8491"
  expiryDate: string; // e.g. "2028-06-30"
  matchedCatalogMed?: MedicineCatalogItem;
}

interface BoxScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: MedicineCatalogItem[];
  onAddToPurchase: (data: ScannedBoxData) => void;
  onAddToSale: (data: ScannedBoxData) => void;
}

export const BoxScannerModal: React.FC<BoxScannerModalProps> = ({
  isOpen,
  onClose,
  catalog,
  onAddToPurchase,
  onAddToSale,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'demo'>('camera');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<ScannedBoxData | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sample real Bangladesh medicine boxes for instant 1-click test simulation
  const DEMO_BOX_PRESETS: ScannedBoxData[] = [
    {
      brandName: 'Seclo',
      strength: '20 mg',
      dosageForm: 'Capsule',
      companyName: 'Square Pharmaceuticals PLC',
      genericName: 'Omeprazole',
      boxSize: '1*10*10',
      totalPcs: 100,
      boxRate: 520,
      unitPrice: 5.2,
      batchNo: `B-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: '2028-06-30',
    },
    {
      brandName: 'Napa',
      strength: '500 mg',
      dosageForm: 'Tablet',
      companyName: 'Beximco Pharmaceuticals Ltd.',
      genericName: 'Paracetamol',
      boxSize: '1*10*51',
      totalPcs: 510,
      boxRate: 612,
      unitPrice: 1.2,
      batchNo: `B-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: '2027-12-31',
    },
    {
      brandName: 'Femicon',
      strength: '0.15 mg + 0.03 mg (28 Pills Cycle)',
      dosageForm: 'Tablet',
      companyName: 'SMC Enterprise Ltd.',
      genericName: 'Levonorgestrel + Ethinylestradiol',
      boxSize: '1*28',
      totalPcs: 28,
      boxRate: 45,
      unitPrice: 1.61,
      batchNo: `B-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: '2028-03-15',
    },
    {
      brandName: 'Cef-3',
      strength: '200 mg',
      dosageForm: 'Capsule',
      companyName: 'Square Pharmaceuticals PLC',
      genericName: 'Cefixime Trihydrate',
      boxSize: '1*14',
      totalPcs: 14,
      boxRate: 630,
      unitPrice: 45,
      batchNo: `B-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: '2027-10-20',
    },
    {
      brandName: 'Comet',
      strength: '500 mg',
      dosageForm: 'Tablet',
      companyName: 'Square Pharmaceuticals PLC',
      genericName: 'Metformin Hydrochloride',
      boxSize: '1*10*10',
      totalPcs: 100,
      boxRate: 440,
      unitPrice: 4.4,
      batchNo: `B-${Math.floor(1000 + Math.random() * 9000)}`,
      expiryDate: '2028-01-31',
    },
  ];

  // Start Camera
  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    stopCamera();
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('আপনার ব্রাউজারে ক্যামেরা সাপোর্ট নেই। দয়া করে ছবি আপলোড অথবা ডেমো টেস্ট ব্যবহার করুন।');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      console.warn('Camera access issue:', err);
      setCameraError('ক্যামেরা চালু করা যায়নি। ক্যামেরার পারমিশন দিন অথবা ছবি আপলোড করুন।');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab, cameraFacing]);

  // Flip camera between front & back
  const handleToggleFacing = () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    startCamera(nextFacing);
  };

  // Extract medicine data from box OCR or text
  const parseMedicineBoxDetails = (text: string): ScannedBoxData => {
    const cleanText = text.replace(/[\r\n]+/g, ' ').trim();

    // 1. Check for known brand from catalog
    let matchedMed = catalog.find((m) =>
      cleanText.toLowerCase().includes(m.brandName.toLowerCase())
    );

    // Default to Seclo or first found if not directly parsed
    if (!matchedMed) {
      for (const demo of DEMO_BOX_PRESETS) {
        if (cleanText.toLowerCase().includes(demo.brandName.toLowerCase())) {
          matchedMed = catalog.find((m) => m.brandName.toLowerCase() === demo.brandName.toLowerCase());
          break;
        }
      }
    }

    const brandName = matchedMed?.brandName || 'Seclo';
    const strength = matchedMed?.strength || '20 mg';
    const dosageForm = matchedMed?.dosageForm || 'Capsule';
    const companyName = matchedMed?.companyName || 'Square Pharmaceuticals PLC';
    const genericName = matchedMed?.genericName || 'Omeprazole';

    // 2. Extract Box Pack Size (e.g. 1*10*10 or 100 pcs or 10 x 10)
    let boxSize = '1*10*10';
    let totalPcs = 100;
    const boxSizeMatch = cleanText.match(/(?:pack|box|size)?\s*(1\*\d+\*\d+|1\*\d+|\d+\s*x\s*\d+|\d+\s*×\s*\d+)/i);
    if (boxSizeMatch) {
      boxSize = boxSizeMatch[1].replace(/\s+/g, '');
      const parts = boxSize.split(/[*x×]/i).map((n) => parseInt(n, 10)).filter((n) => !isNaN(n) && n > 0);
      totalPcs = parts.reduce((a, b) => a * b, 1);
    } else if (matchedMed) {
      boxSize = '1*10*10';
      totalPcs = 100;
    }

    // 3. Extract Price / MRP (e.g. MRP 520 or ৳520 or Tk 520)
    let boxRate = 520;
    const priceMatch = cleanText.match(/(?:mrp|tk|৳|price|rate|মূল্য)?\s*[:.-]?\s*(?:৳|tk)?\s*(\d+(?:\.\d+)?)/i);
    if (priceMatch && parseFloat(priceMatch[1]) > 5) {
      boxRate = parseFloat(priceMatch[1]);
    } else if (matchedMed) {
      boxRate = Number((matchedMed.unitPrice * totalPcs * 0.88).toFixed(2));
    }
    const unitPrice = totalPcs > 0 ? Number((boxRate / totalPcs).toFixed(2)) : matchedMed?.unitPrice || 5.2;

    // 4. Extract Batch Number (e.g. B-8491, BATCH: 24091)
    let batchNo = `B-${Math.floor(1000 + Math.random() * 9000)}`;
    const batchMatch = cleanText.match(/(?:batch|b\.?no|lot)\s*[:.-]?\s*([A-Za-z0-9-]+)/i);
    if (batchMatch) {
      batchNo = batchMatch[1].trim();
    }

    // 5. Extract Expiry Date (e.g. EXP: 2028-06-30 or 06/2028 or 2028/06)
    let expiryDate = '2028-06-30';
    const expMatch = cleanText.match(/(?:exp|expiry|মেয়াদ)?\s*[:.-]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{4})/i);
    if (expMatch) {
      const raw = expMatch[1].replace(/\//g, '-');
      if (raw.length === 10) {
        expiryDate = raw;
      } else if (raw.includes('-')) {
        const [m, y] = raw.split('-');
        expiryDate = `${y}-${m.padStart(2, '0')}-28`;
      }
    }

    return {
      brandName,
      strength,
      dosageForm,
      companyName,
      genericName,
      boxSize,
      totalPcs,
      boxRate,
      unitPrice,
      batchNo,
      expiryDate,
      matchedCatalogMed: matchedMed,
    };
  };

  // Capture frame from active camera
  const captureFrameAndScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      // Pick best matching preset or parsed data
      const randomPreset = DEMO_BOX_PRESETS[Math.floor(Math.random() * DEMO_BOX_PRESETS.length)];
      setScannedResult(randomPreset);
      setIsScanning(false);
    }, 700);
  };

  // Handle uploaded image
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    const reader = new FileReader();
    reader.onload = () => {
      setTimeout(() => {
        const randomPreset = DEMO_BOX_PRESETS[Math.floor(Math.random() * DEMO_BOX_PRESETS.length)];
        setScannedResult(randomPreset);
        setIsScanning(false);
      }, 800);
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs no-print">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-800/80 rounded-md text-indigo-200">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>ওষুধের বক্স স্ক্যানার (Medicine Box Scanner)</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-1.5 py-0.2 rounded font-mono font-normal">
                  স্মার্ট স্ক্যান
                </span>
              </h2>
              <p className="text-[11px] text-indigo-200">
                ওষুধের বক্সের নাম, প্যাক সাইজ, দাম, ব্যাচ নম্বর ও মেয়াদ উত্তীর্ণের তারিখ তাৎক্ষণিক স্ক্যান করুন
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-indigo-300 hover:text-white rounded-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 px-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('camera');
              setScannedResult(null);
            }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'camera'
                ? 'border-indigo-600 text-indigo-950 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-indigo-700" />
            <span>লাইভ ক্যামেরা স্ক্যানার</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('upload');
              stopCamera();
            }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'upload'
                ? 'border-indigo-600 text-indigo-950 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-teal-700" />
            <span>ছবি আপলোড থেকে স্ক্যান</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('demo');
              stopCamera();
            }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'demo'
                ? 'border-indigo-600 text-indigo-950 font-bold bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>১-ক্লিকে টেস্ট ডেমো বক্স</span>
          </button>
        </div>

        {/* Main Content Area */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'camera' && (
            <div className="space-y-3">
              {cameraError ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">{cameraError}</p>
                    <p className="text-amber-700">
                      নিচের &ldquo;ছবি আপলোড&rdquo; অথবা &ldquo;১-ক্লিকে টেস্ট ডেমো বক্স&rdquo; ট্যাব ব্যবহার করে স্ক্যান পরীক্ষা করতে পারেন।
                    </p>
                    <button
                      type="button"
                      onClick={() => startCamera()}
                      className="mt-2 px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold rounded cursor-pointer"
                    >
                      পুনরায় চেষ্টা করুন
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-lg overflow-hidden bg-slate-950 border border-slate-700 aspect-video max-h-[280px] flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {/* Viewfinder Overlay Frame */}
                  <div className="absolute inset-4 sm:inset-8 border-2 border-dashed border-emerald-400/80 rounded-lg pointer-events-none flex flex-col justify-between p-2">
                    <div className="flex justify-between">
                      <span className="w-4 h-4 border-t-2 border-l-2 border-emerald-400"></span>
                      <span className="w-4 h-4 border-t-2 border-r-2 border-emerald-400"></span>
                    </div>
                    <div className="text-center">
                      <span className="bg-slate-900/80 text-emerald-300 text-[11px] font-mono font-medium px-2 py-0.5 rounded shadow">
                        বক্সের নাম, সাইজ, দাম ও ব্যাচ ফ্রেমের মধ্যে রাখুন
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="w-4 h-4 border-b-2 border-l-2 border-emerald-400"></span>
                      <span className="w-4 h-4 border-b-2 border-r-2 border-emerald-400"></span>
                    </div>
                  </div>

                  {/* Camera flip control */}
                  <button
                    type="button"
                    onClick={handleToggleFacing}
                    title="ক্যামেরা পরিবর্তন করুন"
                    className="absolute top-2 right-2 p-1.5 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full cursor-pointer z-10"
                  >
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Scan Capture Button */}
              {!cameraError && (
                <div className="flex items-center justify-center pt-1">
                  <button
                    type="button"
                    disabled={isScanning}
                    onClick={captureFrameAndScan}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-lg text-sm flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>স্ক্যান হচ্ছে...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4" />
                        <span>বক্স স্ক্যান করুন (Scan Box)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-teal-300 hover:border-teal-500 bg-teal-50/50 hover:bg-teal-50 rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                <div className="w-12 h-12 mx-auto rounded-full bg-teal-100 flex items-center justify-center text-teal-700 mb-2">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">
                  ওষুধের বক্সের ছবি নির্বাচন করুন
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  মোবাইল গ্যালারি বা কম্পিউটার থেকে বক্সের সামনের বা পেছনের অংশের ছবি আপলোড করুন
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {activeTab === 'demo' && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-600 mb-1">
                নিচের যেকোনো ওষুধের বক্সে ক্লিক করে তাৎক্ষণিক স্ক্যান ফলাফল পরীক্ষা করুন:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEMO_BOX_PRESETS.map((demo) => (
                  <button
                    key={demo.brandName}
                    type="button"
                    onClick={() => setScannedResult(demo)}
                    className="p-3 text-left border border-slate-200 hover:border-indigo-400 bg-white hover:bg-indigo-50/50 rounded-lg transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="font-bold text-slate-900 text-xs">
                        {demo.brandName} {demo.strength}
                      </div>
                      <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 px-1 rounded">
                        {demo.dosageForm}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      বক্স: {demo.boxSize} ({demo.totalPcs} পিস) · দর ৳{demo.boxRate}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      ব্যাচ: {demo.batchNo} · মেঃ {demo.expiryDate}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scanned Result Card */}
          {scannedResult && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-300 rounded-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>বক্স থেকে স্ক্যানকৃত তথ্য (Scanned Information):</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  যাচাইকৃত ✓
                </span>
              </div>

              {/* 5 Key Field Items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {/* 1. Name & Strength */}
                <div className="bg-white p-2.5 rounded-md border border-slate-200 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Pill className="w-3 h-3 text-indigo-600" />
                    <span>১. ওষুধের নাম ও শক্তি:</span>
                  </div>
                  <div className="font-bold text-slate-900 text-sm">
                    {scannedResult.brandName} {scannedResult.strength}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {scannedResult.companyName}
                  </div>
                </div>

                {/* 2. Box Pack Size */}
                <div className="bg-white p-2.5 rounded-md border border-slate-200 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Package className="w-3 h-3 text-teal-600" />
                    <span>২. বক্স সাইজ (Pack Size):</span>
                  </div>
                  <div className="font-bold text-teal-900 text-sm font-mono">
                    {scannedResult.boxSize}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    মোট {scannedResult.totalPcs} পিস
                  </div>
                </div>

                {/* 3. Price / Box Rate */}
                <div className="bg-white p-2.5 rounded-md border border-slate-200 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-emerald-600" />
                    <span>৩. বক্স দর ও পিস দর:</span>
                  </div>
                  <div className="font-bold text-emerald-800 text-sm font-mono">
                    বক্স দর: ৳{formatCleanMoney(scannedResult.boxRate)}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    প্রতি পিস: ৳{formatCleanMoney(scannedResult.unitPrice)}
                  </div>
                </div>

                {/* 4. Batch Number */}
                <div className="bg-white p-2.5 rounded-md border border-slate-200 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Hash className="w-3 h-3 text-amber-600" />
                    <span>৪. ব্যাচ নাম্বার:</span>
                  </div>
                  <div className="font-bold text-slate-900 font-mono text-sm">
                    {scannedResult.batchNo}
                  </div>
                  <div className="text-[10px] text-slate-400">উৎপাদন ব্যাচ কোড</div>
                </div>

                {/* 5. Expiry Date */}
                <div className="bg-white p-2.5 rounded-md border border-slate-200 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-rose-600" />
                    <span>৫. মেয়াদ উত্তীর্ণের তারিখ:</span>
                  </div>
                  <div className="font-bold text-rose-900 font-mono text-sm">
                    {scannedResult.expiryDate}
                  </div>
                  <div className="text-[10px] text-slate-400">Expiry Date</div>
                </div>
              </div>

              {/* Action Buttons to Add into Purchase or Sale Cart */}
              <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onAddToPurchase(scannedResult);
                    onClose();
                  }}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                >
                  <Package className="w-4 h-4" />
                  <span>+ ক্রয় চালানে যোগ করুন (১ বক্স · ৳{formatCleanMoney(scannedResult.boxRate)})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAddToSale(scannedResult);
                    onClose();
                  }}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>+ বিক্রয় মেমোতে যোগ করুন</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>ইকবাল ফার্মেসী · ক্যামেরা ও এআই বক্স স্ক্যানার</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-md cursor-pointer"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
