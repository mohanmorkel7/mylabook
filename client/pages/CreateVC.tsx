import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCreateLead, usePartialSaveLead, useTemplate } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import TemplatePreviewModal from "@/components/TemplatePreviewModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiSelect } from "@/components/ui/multi-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Save,
  Building,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  Users,
  Calendar,
  Plus,
  Trash2,
  AlertCircle,
  FileText,
  Eye,
  Globe,
  User,
  MessageSquare,
  ExternalLink,
  UserCheck,
  PhoneCall,
  Presentation,
  HelpCircle,
} from "lucide-react";
import { ChevronsUpDown, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Country, State, City } from "country-state-city";
import {
  VC_TYPES,
  SECTOR_FOCUS,
  INVESTOR_FEEDBACK,
  VC_LEAD_SOURCES,
} from "@/lib/constants";

const ROUND_STAGES = [
  { value: "pre_seed", label: "Pre seed" },
  { value: "seed", label: "Seed" },
  { value: "bridge_1", label: "Bridge 1" },
  { value: "bridge_2", label: "Bridge 2" },
  { value: "pre_series_a", label: "Pre Series A" },
  { value: "series_a", label: "Series A" },
  { value: "series_b", label: "Series B" },
  { value: "series_c", label: "Series C" },
];

const COUNTRIES = [
  "India",
  "United States",
  "USA",
  "United Arab Emirates",
  "UAE",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "Israel",
  "Jordan",
  "Lebanon",
  "Egypt",
  "Iraq",
  "Iran",
  "Yemen",
  "Syria",
  "Palestine",
  "United Kingdom",
  "Singapore",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Japan",
  "Other",
];

const PHONE_PREFIXES = [
  { code: "+1", label: "+1 (US)" },
  { code: "+91", label: "+91 (IN)" },
  { code: "+44", label: "+44 (UK)" },
  { code: "+65", label: "+65 (SG)" },
  { code: "+971", label: "+971 (UAE)" },
  { code: "+966", label: "+966 (SA)" },
  { code: "+974", label: "+974 (QA)" },
  { code: "+965", label: "+965 (KW)" },
  { code: "+973", label: "+973 (BH)" },
  { code: "+968", label: "+968 (OM)" },
  { code: "+972", label: "+972 (IL)" },
  { code: "+962", label: "+962 (JO)" },
  { code: "+961", label: "+961 (LB)" },
  { code: "+20", label: "+20 (EG)" },
  { code: "+964", label: "+964 (IQ)" },
  { code: "+98", label: "+98 (IR)" },
  { code: "+967", label: "+967 (YE)" },
  { code: "+963", label: "+963 (SY)" },
  { code: "+970", label: "+970 (PS)" },
  { code: "+61", label: "+61 (AU)" },
  { code: "+49", label: "+49 (DE)" },
  { code: "+33", label: "+33 (FR)" },
  { code: "+81", label: "+81 (JP)" },
];

const CITY_INDEX: Array<{ city: string; state: string; country: string }> = [
  { city: "San Francisco", state: "California", country: "United States" },
  { city: "New York", state: "New York", country: "United States" },
  { city: "Bengaluru", state: "Karnataka", country: "India" },
  { city: "Mumbai", state: "Maharashtra", country: "India" },
  { city: "London", state: "England", country: "United Kingdom" },
  { city: "Singapore", state: "Central", country: "Singapore" },
  { city: "Dubai", state: "Dubai", country: "UAE" },
  { city: "Toronto", state: "Ontario", country: "Canada" },
  { city: "Sydney", state: "New South Wales", country: "Australia" },
  { city: "Berlin", state: "Berlin", country: "Germany" },
  { city: "Paris", state: "Île-de-France", country: "France" },
  { city: "Tokyo", state: "Tokyo", country: "Japan" },
];

const STATES_BY_COUNTRY: Record<string, string[]> = {
  "United States": ["California", "New York"],
  India: ["Karnataka", "Maharashtra"],
  "United Kingdom": ["England"],
  Singapore: ["Central"],
  UAE: ["Dubai"],
  Canada: ["Ontario"],
  Australia: ["New South Wales"],
  Germany: ["Berlin"],
  France: ["Île-de-France"],
  Japan: ["Tokyo"],
};

const CITIES_BY_STATE: Record<string, string[]> = {
  California: ["San Francisco"],
  "New York": ["New York"],
  Karnataka: ["Bengaluru"],
  Maharashtra: ["Mumbai"],
  England: ["London"],
  Central: ["Singapore"],
  Dubai: ["Dubai"],
  Ontario: ["Toronto"],
  "New South Wales": ["Sydney"],
  Berlin: ["Berlin"],
  "Île-de-France": ["Paris"],
  Tokyo: ["Tokyo"],
};

const CURRENCIES = [
  { value: "INR", label: "INR (₹)", symbol: "₹" },
  { value: "USD", label: "USD ($)", symbol: "$" },
  { value: "AED", label: "AED (د.إ)", symbol: "د.إ" },
];

const MIN_CHQ_SIZE_OPTIONS = [
  "0.05",
  "0.10",
  "0.25",
  "0.50",
  "1.00",
  "2.00",
  "3.00",
  "4.00",
  "5.00",
  "6.00",
  "7.00",
  "8.00",
  "9.00",
  "10.00",
];

const MAX_CHQ_SIZE_OPTIONS = [
  "0.10",
  "0.25",
  "0.50",
  "1.00",
  "2.00",
  "3.00",
  "4.00",
  "5.00",
  "6.00",
  "7.00",
  "8.00",
  "9.00",
  "10.00",
  "11.00",
  "12.00",
  "13.00",
  "14.00",
  "15.00",
  "16.00",
  "17.00",
  "18.00",
  "19.00",
  "20.00",
  "21.00",
  "22.00",
  "23.00",
  "24.00",
  "25.00",
  "26.00",
  "27.00",
  "28.00",
  "29.00",
  "30.00",
  "31.00",
  "32.00",
  "33.00",
  "34.00",
  "35.00",
  "36.00",
  "37.00",
  "38.00",
  "39.00",
  "40.00",
  "41.00",
  "42.00",
  "43.00",
  "44.00",
  "45.00",
  "46.00",
  "47.00",
  "48.00",
  "49.00",
  "50.00",
];

const TABS = [
  { value: "lead", label: "Investors Info", icon: "📋" },
  { value: "investor", label: "Investors Contact Info", icon: "🏢" },
];

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export default function CreateVC() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Check if we're in edit mode or resuming from draft
  const isEditMode = !!id;
  const resumeData = location.state?.resumeData;

  // Check URL parameters for draft ID (fallback when location state is lost)
  const urlParams = new URLSearchParams(location.search);
  const draftIdFromUrl = urlParams.get("draftId");

  // Track the current draft ID for subsequent saves
  const [currentDraftId, setCurrentDraftId] = useState(
    resumeData?._resumeFromId || resumeData?.id || draftIdFromUrl || null,
  );

  // Ensure currentDraftId is properly set when resumeData changes or URL changes
  useEffect(() => {
    if (resumeData && (resumeData._resumeFromId || resumeData.id)) {
      const draftId = resumeData._resumeFromId || resumeData.id;
      setCurrentDraftId(draftId);
      console.log(
        "useEffect: Setting currentDraftId from resumeData to:",
        draftId,
      );
    } else if (draftIdFromUrl) {
      setCurrentDraftId(draftIdFromUrl);
      console.log(
        "useEffect: Setting currentDraftId from URL to:",
        draftIdFromUrl,
      );
    }
  }, [resumeData, draftIdFromUrl]);

  // State for VC data
  const [vcData, setVcData] = useState(() => {
    // Use function initialization to prevent re-runs
    return resumeData
      ? {
          // Initialize with resume data
          lead_source: resumeData.lead_source || "",
          lead_source_value: resumeData.lead_source_value || "",
          lead_created_by: resumeData.lead_created_by || "",
          status: resumeData.status || "in-progress",
          investor_name:
            resumeData.investor_name === "PARTIAL_SAVE_IN_PROGRESS"
              ? ""
              : resumeData.investor_name || "",
          company_size: resumeData.company_size || "",
          phone: resumeData.phone || "",
          address: resumeData.address || "",
          city: resumeData.city || "",
          state: resumeData.state || "",
          // Handle country initialization correctly
          country: (() => {
            const savedCountry = resumeData.country || "";
            // If no country was saved, return empty
            if (!savedCountry) return "";
            // If saved country is in our predefined list, use it directly
            if (COUNTRIES.includes(savedCountry)) return savedCountry;
            // If saved country is not in our list, set dropdown to "Other"
            return "Other";
          })(),
          custom_country: (() => {
            const savedCountry = resumeData.country || "";
            // If saved country is in our predefined list, no custom country needed
            if (!savedCountry || COUNTRIES.includes(savedCountry)) return "";
            // If saved country is not in our list, store it as custom country
            return savedCountry;
          })(),
          website: resumeData.website || "",
          potential_lead_investor: resumeData.potential_lead_investor || false,
          minimum_size: resumeData.minimum_size || "",
          maximum_size: resumeData.maximum_size || "",
          minimum_arr_requirement: resumeData.minimum_arr_requirement || "",
          investor_category: (resumeData as any).investor_category || "",
          industry:
            (resumeData as any).industry ||
            (resumeData as any).sector_focus ||
            "",
          investor_last_feedback:
            (resumeData as any).investor_last_feedback || "",
          contacts: resumeData.contacts
            ? typeof resumeData.contacts === "string"
              ? JSON.parse(resumeData.contacts)
              : resumeData.contacts
            : [
                {
                  contact_name: "",
                  designation: "",
                  phone: "",
                  email: "",
                  linkedin: "",
                },
              ],
          round_title:
            resumeData.round_title === "Draft VC - In Progress"
              ? ""
              : resumeData.round_title || "",
          round_size: resumeData.round_size || "",
          valuation: resumeData.valuation || "",
          round_stage: resumeData.round_stage || "",
          project_description: resumeData.round_description || "",
          priority_level: resumeData.priority_level || "medium",
          start_date: (() => {
            try {
              return resumeData.start_date
                ? new Date(resumeData.start_date).toISOString().split("T")[0]
                : "";
            } catch (e) {
              console.warn(
                "Failed to parse resumeData start_date:",
                resumeData.start_date,
              );
              return "";
            }
          })(),
          targeted_end_date: (() => {
            try {
              return resumeData.targeted_end_date
                ? new Date(resumeData.targeted_end_date)
                    .toISOString()
                    .split("T")[0]
                : "";
            } catch (e) {
              console.warn(
                "Failed to parse resumeData targeted_end_date:",
                resumeData.targeted_end_date,
              );
              return "";
            }
          })(),
          spoc: resumeData.spoc || "",
          template_id: resumeData.template_id || "",
          billing_currency: resumeData.billing_currency || "INR",
          fund_raise_status: (resumeData as any).fund_raise_status || "",
          flat_fee_config: [],
          probability: resumeData.probability || "0",
          notes: resumeData.notes || "",
          documents: [],
        }
      : {
          // Default Lead Info
          lead_source: "" as const,
          lead_source_value: "",
          lead_created_by: "",
          status: "in-progress" as const,

          // Investor and Contact Info
          investor_name: "",
          company_size: "",
          phone: "",
          address: "",
          city: "",
          state: "",
          country: "",
          custom_country: "",
          website: "",
          potential_lead_investor: false,
          minimum_size: "",
          maximum_size: "",
          minimum_arr_requirement: "",
          investor_category: "",
          industry: "",
          investor_last_feedback: "",

          // Contacts (start with one primary contact)
          contacts: [
            {
              contact_name: "",
              designation: "",
              phone_prefix: "+1",
              phone: "",
              email: "",
              linkedin: "",
            },
          ] as Array<{
            contact_name: string;
            designation: string;
            phone_prefix?: string;
            phone: string;
            email: string;
            linkedin: string;
          }>,

          // Deal Details (Round Information)
          round_title: "",
          round_size: "",
          valuation: "",
          round_stage: "",
          project_description: "",
          priority_level: "medium" as const,
          start_date: "",
          targeted_end_date: "",
          spoc: "",
          template_id: "",

          // Billing and Commercials
          billing_currency: "INR" as const,
          flat_fee_config: [] as any[],
          fund_raise_status: "",

          // Additional fields
          probability: "0",
          notes: "",
          documents: [] as any[],
        };
  });

  // Dynamic location data via country-state-city
  const allCountries = useMemo(() => Country.getAllCountries(), []);
  const COUNTRY_ALIASES: Record<string, string> = {
    uae: "United Arab Emirates",
    usa: "United States",
    us: "United States",
    uk: "United Kingdom",
    ksa: "Saudi Arabia",
  };
  const findCountry = (input?: string) => {
    if (!input) return undefined;
    const s = input.trim();
    const alias = COUNTRY_ALIASES[s.toLowerCase()];
    const target = alias || s;
    return allCountries.find(
      (c: any) =>
        c.name.toLowerCase() === target.toLowerCase() ||
        c.isoCode.toLowerCase() === target.toLowerCase(),
    );
  };
  const selectedCountryName =
    vcData.country === "Other" ? vcData.custom_country : vcData.country;
  const selectedCountry = findCountry(selectedCountryName);
  const availableStates = useMemo(() => {
    return selectedCountry
      ? State.getStatesOfCountry(selectedCountry.isoCode)
      : [];
  }, [selectedCountry?.isoCode]);
  const selectedStateObj = vcData.state
    ? availableStates.find((s: any) => s.name === vcData.state)
    : undefined;
  const availableCities = useMemo(() => {
    if (!selectedCountry) return [] as any[];
    if (selectedStateObj)
      return City.getCitiesOfState(
        selectedCountry.isoCode,
        selectedStateObj.isoCode,
      );
    return City.getCitiesOfCountry(selectedCountry.isoCode);
  }, [selectedCountry?.isoCode, selectedStateObj?.isoCode]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    if (resumeData) {
      const savedTab = localStorage.getItem(`vc_draft_${resumeData.id}_tab`);
      return savedTab || "lead";
    }
    return "lead";
  });
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    resumeData?.template_id ? resumeData.template_id.toString() : "manual",
  );
  const [isTemplatePreviewOpen, setIsTemplatePreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<any>(null);

  // Currency state
  const [selectedCurrency, setSelectedCurrency] = useState(
    resumeData?.billing_currency || vcData.billing_currency || "INR",
  );

  // Navigation helpers
  const currentTabIndex = TABS.findIndex((tab) => tab.value === activeTab);
  const isFirstTab = currentTabIndex === 0;
  const isLastTab = currentTabIndex === TABS.length - 1;

  // Get currency symbol
  const getCurrencySymbol = (currency: string) => {
    const currencyData = CURRENCIES.find((c) => c.value === currency);
    return currencyData?.symbol || "₹";
  };

  // Get VC templates (category ID for VC templates)
  const {
    data: templates = [],
    isLoading: templatesLoading,
    error: templatesError,
  } = useQuery({
    queryKey: ["templates-by-category", "VC"],
    queryFn: async () => {
      console.log("Fetching VC templates...");
      try {
        // First, try to get the VC category ID
        const categories = await apiClient.request(
          "/templates-production/categories",
        );
        const vcCategory = categories.find((cat: any) => cat.name === "VC");

        if (vcCategory) {
          const result = await apiClient.request(
            `/templates-production/category/${vcCategory.id}`,
          );
          console.log("VC templates fetch successful:", result);
          return result;
        } else {
          console.log("VC category not found, returning empty array");
          return [];
        }
      } catch (error) {
        console.error("VC templates fetch error:", error);
        console.log("Falling back to mock VC templates");
        // Return mock templates when database is not available
        return [
          {
            id: 7,
            name: "Series A Funding Process",
            description: "Complete workflow for Series A funding rounds",
            category: "VC",
            created_by: "System",
            created_at: new Date().toISOString(),
          },
          {
            id: 8,
            name: "Seed Round Management",
            description: "Template for managing seed funding rounds",
            category: "VC",
            created_by: "System",
            created_at: new Date().toISOString(),
          },
        ];
      }
    },
    retry: 2,
    staleTime: 1 * 60 * 1000, // Shorter stale time to check DB more frequently
    cacheTime: 5 * 60 * 1000, // Shorter cache time
  });

  // Fetch template details from API when a template is selected
  const {
    data: templateDetails,
    isLoading: templateDetailsLoading,
    error: templateDetailsError,
  } = useQuery({
    queryKey: ["template-details", selectedTemplate],
    queryFn: async () => {
      if (!selectedTemplate || selectedTemplate === "manual") return null;
      try {
        const result = await apiClient.request(
          `/templates-production/${selectedTemplate}`,
        );
        console.log("Template details fetched:", result);
        return result;
      } catch (error) {
        console.error("Failed to fetch template details:", error);

        // Fallback to mock data for specific known templates
        const id = parseInt(selectedTemplate);
        if (id === 7) {
          return {
            id: 7,
            name: "Series A Funding Process",
            description: "Complete workflow for Series A funding rounds",
            steps: [
              {
                id: 1,
                name: "Initial Pitch Deck Review",
                description: "Review and refine pitch deck",
                probability_percent: 15,
              },
              {
                id: 2,
                name: "Management Presentation",
                description: "Present to investment committee",
                probability_percent: 25,
              },
              {
                id: 3,
                name: "Due Diligence Initiation",
                description: "Begin comprehensive due diligence",
                probability_percent: 35,
              },
              {
                id: 4,
                name: "Term Sheet Negotiation",
                description: "Negotiate terms and valuation",
                probability_percent: 50,
              },
              {
                id: 5,
                name: "Legal Documentation",
                description: "Draft and finalize legal agreements",
                probability_percent: 75,
              },
              {
                id: 6,
                name: "Final Approval",
                description: "Board approval and closing",
                probability_percent: 100,
              },
            ],
            created_by: "VC Team",
            category: {
              id: 6,
              name: "VC",
              color: "#6366F1",
              icon: "Megaphone",
            },
          };
        }
        if (id === 8) {
          return {
            id: 8,
            name: "Seed Round Management",
            description: "Template for managing seed funding rounds",
            steps: [
              {
                id: 1,
                name: "Product Demo",
                description: "Demonstrate product capabilities",
                probability_percent: 20,
              },
              {
                id: 2,
                name: "Market Analysis",
                description: "Present market opportunity",
                probability_percent: 40,
              },
              {
                id: 3,
                name: "Financial Review",
                description: "Review financial projections",
                probability_percent: 60,
              },
              {
                id: 4,
                name: "Investment Agreement",
                description: "Finalize investment terms",
                probability_percent: 80,
              },
              {
                id: 5,
                name: "Closing",
                description: "Complete the funding round",
                probability_percent: 100,
              },
            ],
            created_by: "VC Team",
            category: {
              id: 6,
              name: "VC",
              color: "#6366F1",
              icon: "Megaphone",
            },
          };
        }
        throw error;
      }
    },
    enabled: !!selectedTemplate && selectedTemplate !== "manual",
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });

  // Initialize lead_created_by with user email when user loads or changes
  useEffect(() => {
    if (user?.email && !vcData.lead_created_by) {
      console.log(
        "🐛 DEBUG - Setting lead_created_by to user email:",
        user.email,
      );
      handleInputChange("lead_created_by", user.email);
    }
  }, [user?.email, vcData.lead_created_by]);

  // Synchronize selectedTemplate with loaded template_id from draft data
  useEffect(() => {
    console.log("🔄 Template sync useEffect triggered:", {
      "vcData.template_id": vcData.template_id,
      selectedTemplate,
      "vcData.template_id type": typeof vcData.template_id,
      "selectedTemplate type": typeof selectedTemplate,
      "vcData.investor_name": vcData.investor_name,
      currentDraftId: currentDraftId,
    });

    // Only sync if we have meaningful data (indicating draft is loaded)
    // Skip if we're still in initial state or if investor_name indicates partial save
    const isDraftDataLoaded =
      vcData.investor_name &&
      vcData.investor_name !== "PARTIAL_SAVE_IN_PROGRESS" &&
      vcData.investor_name.trim() !== "";

    if (!isDraftDataLoaded && currentDraftId) {
      console.log("🔄 Draft data not fully loaded yet, skipping template sync");
      return;
    }

    // Convert template_id to string for comparison since Select component uses strings
    const templateIdStr = vcData.template_id
      ? vcData.template_id.toString()
      : "";

    if (templateIdStr && templateIdStr !== selectedTemplate) {
      console.log(
        "✅ Synchronizing selectedTemplate with loaded template_id:",
        templateIdStr,
        "Previous selectedTemplate:",
        selectedTemplate,
      );
      setSelectedTemplate(templateIdStr);
    } else if (!templateIdStr && selectedTemplate !== "manual") {
      console.log("❌ No template_id in draft, setting to manual");
      setSelectedTemplate("manual");
    } else {
      console.log("✨ Template sync - no change needed");
    }
  }, [vcData.template_id, vcData.investor_name, currentDraftId]); // Track multiple fields to ensure proper timing

  // Fetch draft data if we have a draftId but no resumeData
  useEffect(() => {
    const fetchDraftData = async () => {
      if (currentDraftId && !resumeData) {
        console.log("🐛 DEBUG - Fetching draft data for ID:", currentDraftId);
        try {
          const response = await apiClient.request(`/vc/${currentDraftId}`);
          console.log("🐛 DEBUG - Fetched draft data:", response);
          console.log("🐛 DEBUG - Date fields from API:", {
            start_date: response.start_date,
            targeted_end_date: response.targeted_end_date,
            start_date_type: typeof response.start_date,
            targeted_end_date_type: typeof response.targeted_end_date,
          });

          // Update the VC data with the fetched draft
          setVcData((prevData) => ({
            ...prevData,
            lead_source: response.lead_source || prevData.lead_source,
            lead_source_value:
              response.lead_source_value || prevData.lead_source_value,
            lead_created_by:
              response.lead_created_by || prevData.lead_created_by,
            status: response.status || prevData.status,
            investor_name:
              response.investor_name === "PARTIAL_SAVE_IN_PROGRESS"
                ? ""
                : response.investor_name || prevData.investor_name,
            company_size: response.company_size || prevData.company_size,
            phone: response.phone || prevData.phone,
            address: response.address || prevData.address,
            city: response.city || prevData.city,
            state: response.state || prevData.state,
            // Handle country field properly - preserve current value if exists
            country: (() => {
              // If user has already selected a country, preserve it
              if (prevData.country && prevData.country.trim()) {
                console.log(
                  "🐛 DEBUG - Preserving current country:",
                  prevData.country,
                );
                return prevData.country;
              }

              const savedCountry = response.country || "";
              console.log("🐛 DEBUG - Fetched country from API:", savedCountry);
              if (!savedCountry) return "";
              if (COUNTRIES.includes(savedCountry)) return savedCountry;
              return "Other";
            })(),
            custom_country: (() => {
              // If user has already set custom country, preserve it
              if (prevData.custom_country && prevData.custom_country.trim()) {
                console.log(
                  "🐛 DEBUG - Preserving current custom_country:",
                  prevData.custom_country,
                );
                return prevData.custom_country;
              }

              const savedCountry = response.country || "";
              if (!savedCountry || COUNTRIES.includes(savedCountry)) return "";
              return savedCountry;
            })(),
            website: response.website || prevData.website,
            potential_lead_investor:
              response.potential_lead_investor ||
              prevData.potential_lead_investor,
            minimum_size: response.minimum_size || prevData.minimum_size,
            maximum_size: response.maximum_size || prevData.maximum_size,
            minimum_arr_requirement:
              response.minimum_arr_requirement ||
              prevData.minimum_arr_requirement,
            contacts: (() => {
              let contacts = response.contacts
                ? typeof response.contacts === "string"
                  ? JSON.parse(response.contacts)
                  : response.contacts
                : prevData.contacts;
              contacts = Array.from({ length: 3 }, (_, i) => ({
                contact_name: contacts?.[i]?.contact_name || "",
                designation: contacts?.[i]?.designation || "",
                phone_prefix: contacts?.[i]?.phone_prefix || "+1",
                phone: contacts?.[i]?.phone || "",
                email: contacts?.[i]?.email || "",
                linkedin: contacts?.[i]?.linkedin || "",
              }));
              return contacts;
            })(),
            round_title:
              response.round_title === "Draft VC - In Progress"
                ? ""
                : response.round_title || prevData.round_title,
            round_size: response.round_size || prevData.round_size,
            valuation: response.valuation || prevData.valuation,
            round_stage: response.round_stage || prevData.round_stage,
            project_description:
              response.round_description || prevData.project_description,
            priority_level: response.priority_level || prevData.priority_level,
            start_date: (() => {
              try {
                return response.start_date
                  ? new Date(response.start_date).toISOString().split("T")[0]
                  : prevData.start_date || "";
              } catch (e) {
                console.warn(
                  "Failed to parse start_date:",
                  response.start_date,
                );
                return prevData.start_date || "";
              }
            })(),
            targeted_end_date: (() => {
              try {
                return response.targeted_end_date
                  ? new Date(response.targeted_end_date)
                      .toISOString()
                      .split("T")[0]
                  : prevData.targeted_end_date || "";
              } catch (e) {
                console.warn(
                  "Failed to parse targeted_end_date:",
                  response.targeted_end_date,
                );
                return prevData.targeted_end_date || "";
              }
            })(),
            spoc: response.spoc || prevData.spoc,
            template_id: (() => {
              const templateId = response.template_id || prevData.template_id;
              console.log("�� DEBUG - Loading template_id from API:", {
                "response.template_id": response.template_id,
                "prevData.template_id": prevData.template_id,
                "final templateId": templateId,
                "templateId type": typeof templateId,
              });
              return templateId;
            })(),
            billing_currency:
              response.billing_currency || prevData.billing_currency,
            probability: response.probability || prevData.probability,
            notes: response.notes || prevData.notes,
          }));

          // Debug: Check what dates were actually set
          setTimeout(() => {
            console.log("🐛 DEBUG - Final date values in state:", {
              start_date: vcData.start_date,
              targeted_end_date: vcData.targeted_end_date,
            });
          }, 100);

          // Force template synchronization after API data is loaded
          setTimeout(() => {
            const apiTemplateId = response.template_id;
            if (apiTemplateId) {
              const templateIdStr = apiTemplateId.toString();
              console.log("🔄 Force syncing template after API load:", {
                apiTemplateId,
                templateIdStr,
                currentSelectedTemplate: selectedTemplate,
              });
              if (templateIdStr !== selectedTemplate) {
                console.log(
                  "✅ Force setting selectedTemplate to:",
                  templateIdStr,
                );
                setSelectedTemplate(templateIdStr);
              }
            } else {
              console.log(
                "❌ No template_id in API response, force setting to manual",
              );
              if (selectedTemplate !== "manual") {
                setSelectedTemplate("manual");
              }
            }
          }, 200);

          console.log(
            "�� DEBUG - After setting vcData from API, country fields should be:",
            {
              country: (() => {
                const savedCountry = response.country || "";
                if (!savedCountry) return "";
                if (COUNTRIES.includes(savedCountry)) return savedCountry;
                return "Other";
              })(),
              custom_country: (() => {
                const savedCountry = response.country || "";
                if (!savedCountry || COUNTRIES.includes(savedCountry))
                  return "";
                return savedCountry;
              })(),
              originalApiCountry: response.country,
            },
          );

          // Restore the saved tab if available
          const savedTab = localStorage.getItem(
            `vc_draft_${currentDraftId}_tab`,
          );
          if (savedTab && savedTab !== activeTab) {
            console.log("🐛 DEBUG - Restoring saved tab:", savedTab);
            setActiveTab(savedTab);
          }
        } catch (error) {
          console.error("🐛 ERROR - Failed to fetch draft data:", error);
        }
      }
    };

    fetchDraftData();
  }, [currentDraftId, resumeData]); // Removed activeTab to prevent refetch on tab changes

  // Debug country initialization when resuming from draft
  useEffect(() => {
    console.log("🐛 DEBUG - Component initialized/updated:");
    console.log("resumeData:", resumeData);
    console.log("resumeData?.country:", resumeData?.country);
    console.log("resumeData?.template_id:", resumeData?.template_id);
    console.log("vcData.country:", vcData.country);
    console.log("vcData.custom_country:", vcData.custom_country);
    console.log("vcData.template_id:", vcData.template_id);
    console.log("selectedTemplate:", selectedTemplate);
    console.log("currentDraftId:", currentDraftId);
    if (resumeData?.country) {
      console.log(
        "Is resumeData.country in COUNTRIES?",
        COUNTRIES.includes(resumeData.country),
      );
    }
  }, [
    resumeData,
    vcData.country,
    vcData.custom_country,
    vcData.template_id,
    selectedTemplate,
    currentDraftId,
  ]);

  const createVCMutation = useMutation({
    mutationFn: (vcData: any) =>
      apiClient.request("/vc", {
        method: "POST",
        body: JSON.stringify(vcData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vcs"] });
      queryClient.invalidateQueries({ queryKey: ["my-vc-partial-saves"] });
      queryClient.invalidateQueries({ queryKey: ["vc-stats"] });
    },
  });

  const partialSaveMutation = useMutation({
    mutationFn: (vcData: any) => {
      // If we have a current draft ID, update the existing draft
      if (currentDraftId) {
        return apiClient.request(`/vc/${currentDraftId}`, {
          method: "PUT",
          body: JSON.stringify({ ...vcData, is_partial: true }),
        });
      } else {
        // Create a new draft
        return apiClient.request("/vc", {
          method: "POST",
          body: JSON.stringify({ ...vcData, is_partial: true }),
        });
      }
    },
    onSuccess: (response: any) => {
      console.log(
        "Partial save success - currentDraftId:",
        currentDraftId,
        "response:",
        response,
      );

      // If this was a new draft (no currentDraftId), set the draft ID from the response
      if (!currentDraftId && response.data?.id) {
        console.log("Setting new draft ID from response:", response.data.id);
        setCurrentDraftId(response.data.id);
      }

      queryClient.invalidateQueries({ queryKey: ["vcs"] });
      queryClient.invalidateQueries({ queryKey: ["my-vc-partial-saves"] });
      queryClient.invalidateQueries({ queryKey: ["vc-stats"] });
    },
  });

  // Navigation functions
  const handleNextTab = async () => {
    // Validate current tab before moving next
    if (activeTab === "lead") {
      const newErrors: Record<string, string> = {};
      if (!vcData.lead_source) newErrors.lead_source = "Source is required";
      if (!vcData.lead_source_value?.trim())
        newErrors.lead_source_value = "Source information is required";
      if (
        vcData.lead_source?.startsWith("email_") &&
        vcData.lead_source_value?.trim() &&
        !isValidEmail(vcData.lead_source_value)
      ) {
        newErrors.lead_source_value = "Enter a valid email address";
      }
      if (!vcData.investor_name.trim())
        newErrors.investor_name = "Venture Capital Name is required";
      if (!(vcData as any).investor_category)
        (newErrors as any).investor_category = "VC Type is required";
      if (!(vcData as any).industry)
        (newErrors as any).industry = "Sector Focus is required";
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) return;
    }
    if (!isLastTab) {
      // Auto-save when moving to next tab
      const hasData =
        vcData.investor_name || vcData.round_title || vcData.email;
      if (hasData) {
        try {
          await partialSaveMutation.mutateAsync();
        } catch (error) {
          console.error("Failed to auto-save when navigating:", error);
        }
      }
      const nextTab = TABS[currentTabIndex + 1].value;
      setActiveTab(nextTab);
      // Save current tab to localStorage
      if (currentDraftId) {
        localStorage.setItem(`vc_draft_${currentDraftId}_tab`, nextTab);
      }
    }
  };

  const handlePreviousTab = () => {
    if (!isFirstTab) {
      const prevTab = TABS[currentTabIndex - 1].value;
      setActiveTab(prevTab);
      // Save current tab to localStorage
      if (currentDraftId) {
        localStorage.setItem(`vc_draft_${currentDraftId}_tab`, prevTab);
      }
    }
  };

  const handleInputChange = (field: string, value: any) => {
    // Debug country field changes
    if (field === "country" || field === "custom_country") {
      console.log(`🐛 DEBUG - handleInputChange: ${field} = "${value}"`);
      console.log("Current vcData.country:", vcData.country);
      console.log("Current vcData.custom_country:", vcData.custom_country);
    }

    // Debug template_id field changes
    if (field === "template_id") {
      console.log(`🔄 DEBUG - handleInputChange: template_id = "${value}"`);
      console.log("Current vcData.template_id:", vcData.template_id);
      console.log("Current selectedTemplate:", selectedTemplate);
    }

    // Use functional state update to ensure we have the latest state
    setVcData((prevData) => {
      const newData = {
        ...prevData,
        [field]: value,
      };

      // Clear lead_source_value when lead_source changes
      if (field === "lead_source") {
        newData.lead_source_value = "";
      }

      // Debug country specific updates
      if (field === "country") {
        console.log(
          "🐛 DEBUG - Functional update - setting country to:",
          value,
        );
        console.log("🐛 DEBUG - Previous data country:", prevData.country);
        console.log("🐛 DEBUG - New data country:", newData.country);
      }

      return newData;
    });

    // Additional debugging for country field - check state persistence
    if (field === "country") {
      setTimeout(() => {
        console.log("🐛 DEBUG - vcData.country after 100ms:", vcData.country);
      }, 100);
    }

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Contact management functions
  const updateContact = (index: number, field: string, value: string) => {
    const newContacts = [...vcData.contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    setVcData((prev) => ({ ...prev, contacts: newContacts }));
  };

  const addContact = () => {
    setVcData((prev) => {
      if (prev.contacts.length >= 3) return prev;
      return {
        ...prev,
        contacts: [
          ...prev.contacts,
          {
            contact_name: "",
            designation: "",
            phone_prefix: "+1",
            phone: "",
            email: "",
            linkedin: "",
          },
        ],
      };
    });
  };

  const removeContact = (index: number) => {
    if (vcData.contacts.length > 1) {
      const newContacts = vcData.contacts.filter((_, i) => i !== index);
      setVcData((prev) => ({ ...prev, contacts: newContacts }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Required fields validation
    if (!vcData.lead_source) {
      newErrors.lead_source = "Source is required";
    }
    if (!vcData.lead_source_value?.trim()) {
      newErrors.lead_source_value = "Source information is required";
    }
    if (
      vcData.lead_source?.startsWith("email_") &&
      vcData.lead_source_value?.trim() &&
      !isValidEmail(vcData.lead_source_value)
    ) {
      newErrors.lead_source_value = "Enter a valid email address";
    }
    if (!vcData.investor_name.trim()) {
      newErrors.investor_name = "Venture Capital Name is required";
    }
    if (!(vcData as any).investor_category) {
      (newErrors as any).investor_category = "VC Type is required";
    }
    if (!(vcData as any).industry) {
      (newErrors as any).industry = "Sector Focus is required";
    }
    if (!vcData.country) {
      newErrors.country = "Country is required";
    }
    if (!vcData.state) {
      newErrors.state = "State is required";
    }
    if (!vcData.city) {
      newErrors.city = "City is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare VC data for submission
      const submitData = {
        lead_source: vcData.lead_source,
        lead_source_value: vcData.lead_source_value,
        lead_created_by: vcData.lead_created_by,
        status: vcData.status,
        investor_category: (vcData as any).investor_category || null,
        investor_name: vcData.investor_name,
        industry: (vcData as any).industry || null,
        investor_last_feedback: (vcData as any).investor_last_feedback || null,
        phone: vcData.phone,
        address: vcData.address,
        city: vcData.city,
        state: vcData.state,
        country:
          vcData.country === "Other" && vcData.custom_country?.trim()
            ? vcData.custom_country.trim()
            : vcData.country || null,
        website: vcData.website,
        company_size: vcData.company_size,
        potential_lead_investor: vcData.potential_lead_investor,
        minimum_size: vcData.minimum_size
          ? parseFloat(vcData.minimum_size)
          : null,
        maximum_size: vcData.maximum_size
          ? parseFloat(vcData.maximum_size)
          : null,
        minimum_arr_requirement: vcData.minimum_arr_requirement
          ? parseFloat(vcData.minimum_arr_requirement)
          : null,
        template_id: vcData.template_id || null,
        billing_currency: vcData.billing_currency,
        contacts: JSON.stringify(vcData.contacts),
        created_by: parseInt(user.id),
      };

      console.log("🚀 DEBUG - Submitting final data:", submitData);
      console.log("🚀 DEBUG - Country values at submit time:", {
        "vcData.country": vcData.country,
        "vcData.custom_country": vcData.custom_country,
        "submitData.country": submitData.country,
      });
      console.log("🚀 DEBUG - Full vcData at submit:", vcData);
      const result = await createVCMutation.mutateAsync(submitData);

      // If we were working with a draft, delete the draft
      if (currentDraftId) {
        try {
          await apiClient.request(`/vc/${currentDraftId}`, {
            method: "DELETE",
          });
          queryClient.invalidateQueries({ queryKey: ["my-vc-partial-saves"] });
          localStorage.removeItem(`vc_draft_${currentDraftId}_tab`); // Clean up saved tab
          setCurrentDraftId(null); // Clear the draft ID
        } catch (error) {
          console.error("Failed to delete draft after creation:", error);
          // Don't block navigation on draft deletion failure
        }
      }

      toast({
        title: "VC created",
        description: "New VC created successfully.",
      });
      navigate(`/vc/${result.data?.id || result.id}`);
    } catch (error) {
      console.error("Failed to create VC:", error);
      toast({
        title: "Create failed",
        description: "Failed to create VC. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePartialSave = async () => {
    try {
      // Log current state before doing anything
      console.log(
        "🐛 DEBUG - handlePartialSave called, current vcData.country:",
        vcData.country,
      );
      console.log(
        "��� DEBUG - handlePartialSave called, current vcData.custom_country:",
        vcData.custom_country,
      );

      // Check actual DOM values vs state
      const countryDropdown = document
        .querySelector('label[for="country"]')
        ?.nextElementSibling?.querySelector("span")
        ?.textContent?.trim();
      const customCountryInput =
        document.querySelector("#custom_country")?.value;
      console.log("���� DEBUG - DOM vs State comparison:", {
        domCountryDropdown: countryDropdown,
        stateCountry: vcData.country,
        domCustomCountry: customCountryInput,
        stateCustomCountry: vcData.custom_country,
      });

      // Determine the final country value to save
      const countryValue =
        vcData.country === "Other" && vcData.custom_country?.trim()
          ? vcData.custom_country.trim()
          : vcData.country || null;

      console.log("🐛 DEBUG - Partial Save Country:", {
        dropdown: vcData.country,
        custom: vcData.custom_country,
        finalValue: countryValue,
      });

      const partialData = {
        lead_source: vcData.lead_source || "other",
        lead_source_value: vcData.lead_source_value,
        lead_created_by: vcData.lead_created_by,
        status: vcData.status,
        investor_category: (vcData as any).investor_category || null,
        investor_name: vcData.investor_name || "PARTIAL_SAVE_IN_PROGRESS",
        industry: (vcData as any).industry || null,
        investor_last_feedback: (vcData as any).investor_last_feedback || null,
        phone: vcData.phone,
        address: vcData.address,
        city: vcData.city,
        state: vcData.state,
        country: countryValue,
        website: vcData.website,
        company_size: vcData.company_size,
        potential_lead_investor: vcData.potential_lead_investor,
        minimum_size: vcData.minimum_size
          ? parseFloat(vcData.minimum_size)
          : null,
        maximum_size: vcData.maximum_size
          ? parseFloat(vcData.maximum_size)
          : null,
        minimum_arr_requirement: vcData.minimum_arr_requirement
          ? parseFloat(vcData.minimum_arr_requirement)
          : null,
        template_id: vcData.template_id || null,
        billing_currency: vcData.billing_currency,
        contacts: JSON.stringify(vcData.contacts),
        created_by: parseInt(user.id),
        is_partial: true,
      };

      console.log("🚀 DEBUG - Saving partial data:", partialData);
      const result = await partialSaveMutation.mutateAsync(partialData);

      // Save the current active tab for restoration when continuing
      localStorage.setItem(
        `vc_draft_${currentDraftId || "new"}_tab`,
        activeTab,
      );

      toast({
        title: currentDraftId ? "Draft updated" : "Draft saved",
        description: currentDraftId
          ? "Draft updated successfully."
          : "VC data saved as draft.",
      });
    } catch (error) {
      console.error("Failed to save partial VC:", error);
      toast({
        title: "Save failed",
        description: "Failed to save draft. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/vc")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to VC Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {currentDraftId ? "Edit VC Draft" : "Create VC"}
            </h1>
            <p className="text-gray-600">
              {currentDraftId
                ? "Continue working on your saved VC draft"
                : "Create a new venture capital opportunity"}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={handlePartialSave}
            disabled={partialSaveMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {currentDraftId ? "Update Draft" : "Save Draft"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || createVCMutation.isPending}
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </div>

      {/* Form Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lead">Investors Info</TabsTrigger>
          <TabsTrigger value="investor">Investors Contact Info</TabsTrigger>
        </TabsList>

        {/* Lead Info Tab */}
        <TabsContent value="lead" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Investors Info</CardTitle>
              <CardDescription>
                Basic information about this VC opportunity lead
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="lead_created_by">Lead Created By</Label>
                  <Input
                    id="lead_created_by"
                    placeholder="Name of person who created this lead"
                    value={vcData.lead_created_by}
                    onChange={(e) =>
                      handleInputChange("lead_created_by", e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="lead_source">Source *</Label>
                  <Select
                    value={vcData.lead_source}
                    onValueChange={(value) =>
                      handleInputChange("lead_source", value)
                    }
                  >
                    <SelectTrigger
                      className={errors.lead_source ? "border-red-500" : ""}
                    >
                      <SelectValue placeholder="Select how you found this lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {VC_LEAD_SOURCES.map((opt) => {
                        const Icon = opt.value.startsWith("email_")
                          ? Mail
                          : opt.value.startsWith("call_")
                            ? Phone
                            : opt.value.startsWith("linkedin_")
                              ? MessageSquare
                              : opt.value === "reference"
                                ? UserCheck
                                : opt.value === "general_list"
                                  ? FileText
                                  : HelpCircle;
                        return (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="w-4 h-4" />
                              {opt.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {errors.lead_source && (
                    <p className="text-sm text-red-600 mt-1">
                      {errors.lead_source}
                    </p>
                  )}
                </div>

                {/* Dynamic Lead Source Value */}
                {vcData.lead_source && (
                  <div className="md:col-span-2">
                    <Label htmlFor="lead_source_value">
                      {vcData.lead_source?.startsWith("email_") &&
                        "Email Address *"}
                      {vcData.lead_source?.startsWith("call_") &&
                        "Phone Number *"}
                      {vcData.lead_source?.startsWith("linkedin_") &&
                        "LinkedIn Profile/Link *"}
                      {vcData.lead_source === "reference" && "Referred by *"}
                      {vcData.lead_source === "general_list" &&
                        "List Name/Details *"}
                    </Label>
                    <div className="relative mt-1">
                      {vcData.lead_source?.startsWith("email_") && (
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      )}
                      {vcData.lead_source?.startsWith("call_") && (
                        <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      )}
                      {vcData.lead_source?.startsWith("linkedin_") && (
                        <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      )}
                      <Input
                        id="lead_source_value"
                        value={vcData.lead_source_value}
                        onChange={(e) =>
                          handleInputChange("lead_source_value", e.target.value)
                        }
                        className={`pl-10 ${errors.lead_source_value ? "border-red-500" : ""}`}
                        placeholder={
                          vcData.lead_source?.startsWith("email_")
                            ? "contact@investor.com"
                            : vcData.lead_source?.startsWith("call_")
                              ? "+1 (555) 000-0000"
                              : vcData.lead_source?.startsWith("linkedin_")
                                ? "LinkedIn profile link"
                                : vcData.lead_source === "reference"
                                  ? "Name of person who referred"
                                  : vcData.lead_source === "general_list"
                                    ? "List name or details"
                                    : "Describe the source"
                        }
                      />
                    </div>
                    {errors.lead_source_value && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.lead_source_value}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <Label htmlFor="investor_name">
                      Venture Capital Name *
                    </Label>
                    <Input
                      id="investor_name"
                      placeholder="Name of the VC firm"
                      value={vcData.investor_name}
                      onChange={(e) =>
                        handleInputChange("investor_name", e.target.value)
                      }
                      className={errors.investor_name ? "border-red-500" : ""}
                    />
                    {errors.investor_name && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.investor_name}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="investor_category">VC Type *</Label>
                    <Select
                      value={(vcData as any).investor_category}
                      onValueChange={(value) =>
                        handleInputChange("investor_category" as any, value)
                      }
                    >
                      <SelectTrigger
                        className={
                          errors.investor_category ? "border-red-500" : ""
                        }
                      >
                        <SelectValue placeholder="Select VC Type" />
                      </SelectTrigger>
                      <SelectContent>
                        {VC_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.investor_category && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.investor_category}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="industry">Sector Focus *</Label>
                    <Select
                      value={(vcData as any).industry}
                      onValueChange={(value) =>
                        handleInputChange("industry" as any, value)
                      }
                    >
                      <SelectTrigger
                        className={errors.industry ? "border-red-500" : ""}
                      >
                        <SelectValue placeholder="Select Sector Focus" />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTOR_FOCUS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.industry && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.industry}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      placeholder="https://investor.com"
                      value={vcData.website}
                      onChange={(e) =>
                        handleInputChange("website", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="minimum_size">Min.Chq Size $ Mn</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={false}
                          className={`w-full justify-between ${errors.minimum_size ? "border-red-500" : ""}`}
                        >
                          {vcData.minimum_size || "Select amount"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="start"
                        avoidCollisions={true}
                        collisionPadding={8}
                        className="w-[--radix-popover-trigger-width] p-0 max-h-[min(50vh,320px)] overflow-auto z-50"
                      >
                        <Command>
                          <CommandInput placeholder="Search amount..." />
                          <CommandList>
                            <CommandEmpty>No amounts found.</CommandEmpty>
                            <CommandGroup>
                              {MIN_CHQ_SIZE_OPTIONS.map((v) => (
                                <CommandItem
                                  key={v}
                                  value={v}
                                  onSelect={(val) => {
                                    handleInputChange("minimum_size", val);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      vcData.minimum_size === v
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  {v}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {errors.minimum_size && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.minimum_size}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="maximum_size">Max.Chq Size $ Mn</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={false}
                          className={`w-full justify-between ${errors.maximum_size ? "border-red-500" : ""}`}
                        >
                          {vcData.maximum_size || "Select amount"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="start"
                        avoidCollisions={true}
                        collisionPadding={8}
                        className="w-[--radix-popover-trigger-width] p-0 max-h-[min(50vh,320px)] overflow-auto z-50"
                      >
                        <Command>
                          <CommandInput placeholder="Search amount..." />
                          <CommandList>
                            <CommandEmpty>No amounts found.</CommandEmpty>
                            <CommandGroup>
                              {MAX_CHQ_SIZE_OPTIONS.map((v) => (
                                <CommandItem
                                  key={v}
                                  value={v}
                                  onSelect={(val) => {
                                    handleInputChange("maximum_size", val);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      vcData.maximum_size === v
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  {v}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {errors.maximum_size && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.maximum_size}
                      </p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="investor_last_feedback">
                      Investor Last Feedback
                    </Label>
                    <Select
                      value={(vcData as any).investor_last_feedback}
                      onValueChange={(value) =>
                        handleInputChange(
                          "investor_last_feedback" as any,
                          value,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select last feedback" />
                      </SelectTrigger>
                      <SelectContent>
                        {INVESTOR_FEEDBACK.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isEditMode && (
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={vcData.status}
                      onValueChange={(value) =>
                        handleInputChange("status", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="won">Won</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handlePreviousTab}
              disabled={isFirstTab}
            >
              Previous
            </Button>
            <Button onClick={handleNextTab} disabled={isLastTab}>
              Next
            </Button>
          </div>
        </TabsContent>

        {/* Investor and Contact Info Tab */}
        <TabsContent value="investor" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Investors Contact Info</CardTitle>
              <CardDescription>
                Details about the investor and contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    placeholder="Street address"
                    value={vcData.address}
                    onChange={(e) =>
                      handleInputChange("address", e.target.value)
                    }
                  />
                </div>

                {/* Searchable Location Fields */}
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={false}
                        className={`w-full justify-between ${errors.country ? "border-red-500" : ""}`}
                      >
                        {vcData.country || "Select country"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[--radix-popover-trigger-width] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Search country..." />
                        <CommandEmpty>No country found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            {COUNTRIES.map((country) => (
                              <CommandItem
                                key={country}
                                value={country}
                                onSelect={(value) => {
                                  handleInputChange("country", value);
                                  handleInputChange("state", "");
                                  handleInputChange("city", "");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    vcData.country === country
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {country}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.country && (
                    <p className="text-sm text-red-600 mt-1">
                      {errors.country}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="state">State/Province *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={false}
                        className={`w-full justify-between ${errors.state ? "border-red-500" : ""}`}
                      >
                        {vcData.state || "Select state"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[--radix-popover-trigger-width] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Search state..." />
                        <CommandEmpty>No state found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            {availableStates.map((state: any) => (
                              <CommandItem
                                key={state.isoCode}
                                value={state.isoCode}
                                onSelect={(value) => {
                                  const st = availableStates.find(
                                    (s: any) => s.isoCode === value,
                                  );
                                  if (st) {
                                    handleInputChange("state", st.name);
                                    if (selectedCountry) {
                                      handleInputChange(
                                        "country",
                                        selectedCountry.name,
                                      );
                                    }
                                    handleInputChange("city", "");
                                  }
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    vcData.state === state.name
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {state.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.state && (
                    <p className="text-sm text-red-600 mt-1">{errors.state}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="city">City *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={false}
                        className={`w-full justify-between ${errors.city ? "border-red-500" : ""}`}
                      >
                        {vcData.city || "Select city"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[--radix-popover-trigger-width] p-0"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Search city..." />
                        <CommandEmpty>No city found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            {availableCities.map((city: any) => {
                              const value = `${city.name}|${city.stateCode || ""}|${city.countryCode}`;
                              return (
                                <CommandItem
                                  key={value}
                                  value={value}
                                  onSelect={(val) => {
                                    const [name, stateCode, countryCode] =
                                      val.split("|");
                                    handleInputChange("city", name);
                                    const countryObj =
                                      Country.getAllCountries().find(
                                        (c: any) => c.isoCode === countryCode,
                                      );
                                    if (countryObj)
                                      handleInputChange(
                                        "country",
                                        countryObj.name,
                                      );
                                    if (stateCode) {
                                      const stObj =
                                        State.getStateByCodeAndCountry(
                                          stateCode,
                                          countryCode,
                                        );
                                      if (stObj)
                                        handleInputChange("state", stObj.name);
                                    }
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      vcData.city === city.name
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  {city.name}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {errors.city && (
                    <p className="text-sm text-red-600 mt-1">{errors.city}</p>
                  )}
                </div>
              </div>

              {/* Multiple Contacts Section */}
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Contact Information</h3>
                </div>

                <div className="space-y-4">
                  {vcData.contacts.map((contact, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">Contact {index + 1}</h4>
                          {index === 0 && (
                            <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded">
                              Primary
                            </span>
                          )}
                        </div>
                        {index > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeContact(index)}
                            aria-label="Remove contact"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`contact_name_${index}`}>
                            Contact Name {index + 1}
                          </Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              id={`contact_name_${index}`}
                              value={contact.contact_name}
                              onChange={(e) =>
                                updateContact(
                                  index,
                                  "contact_name",
                                  e.target.value,
                                )
                              }
                              placeholder="Contact person's name"
                              className="pl-10"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor={`designation_${index}`}>
                            Contact Designation {index + 1}
                          </Label>
                          <Input
                            id={`designation_${index}`}
                            value={contact.designation}
                            onChange={(e) =>
                              updateContact(
                                index,
                                "designation",
                                e.target.value,
                              )
                            }
                            placeholder="Partner, Associate, etc."
                          />
                        </div>

                        <div>
                          <Label htmlFor={`contact_email_${index}`}>
                            Contact {index + 1} - Email
                          </Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <Input
                              id={`contact_email_${index}`}
                              type="email"
                              value={contact.email}
                              onChange={(e) =>
                                updateContact(index, "email", e.target.value)
                              }
                              placeholder="contact@investor.com"
                              className="pl-10"
                            />
                          </div>
                        </div>

                        <div>
                          <Label htmlFor={`contact_phone_${index}`}>
                            Contact {index + 1} - Phone
                          </Label>
                          <div className="flex gap-2">
                            <Select
                              value={contact.phone_prefix || "+1"}
                              onValueChange={(value) =>
                                updateContact(index, "phone_prefix", value)
                              }
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PHONE_PREFIXES.map((p) => (
                                  <SelectItem key={p.code} value={p.code}>
                                    {p.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              id={`contact_phone_${index}`}
                              value={contact.phone}
                              onChange={(e) =>
                                updateContact(index, "phone", e.target.value)
                              }
                              placeholder="(555) 123-4567"
                            />
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addContact}
              disabled={vcData.contacts.length >= 3}
            >
              <Plus className="w-4 h-4 mr-2" /> Add Contact
            </Button>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handlePreviousTab}
              disabled={isFirstTab}
            >
              Previous
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || createVCMutation.isPending}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </TabsContent>

        {/* Deal Details Tab */}
        <TabsContent value="round" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fund Raise</CardTitle>
              <CardDescription>
                Details about the funding round and investment terms
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="fund_raise_status">Status</Label>
                  <Select
                    value={(vcData as any).fund_raise_status || ""}
                    onValueChange={(value) =>
                      handleInputChange("fund_raise_status" as any, value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dropped">Dropped</SelectItem>
                      <SelectItem value="wip">WIP</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="round_title">Fund Raise Title *</Label>
                  <Input
                    id="round_title"
                    placeholder="e.g., Series A Funding"
                    value={vcData.round_title}
                    onChange={(e) =>
                      handleInputChange("round_title", e.target.value)
                    }
                    className={errors.round_title ? "border-red-500" : ""}
                  />
                  {errors.round_title && (
                    <p className="text-sm text-red-600 mt-1">
                      {errors.round_title}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="round_stage">Investment Stage</Label>
                  <Select
                    value={vcData.round_stage}
                    onValueChange={(value) =>
                      handleInputChange("round_stage", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select investment stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUND_STAGES.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="round_size">Total Fund Raise $ Mn</Label>
                  <Input
                    id="round_size"
                    placeholder={`e.g., $10M`}
                    value={vcData.round_size}
                    onChange={(e) =>
                      handleInputChange("round_size", e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="valuation">Valuation $ Mn</Label>
                  <Input
                    id="valuation"
                    placeholder={`e.g., $100M`}
                    value={vcData.valuation}
                    onChange={(e) =>
                      handleInputChange("valuation", e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="priority_level">Priority Level</Label>
                  <Select
                    value={vcData.priority_level}
                    onValueChange={(value) =>
                      handleInputChange("priority_level", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="spoc">SPOC (Single Point of Contact)</Label>
                  <Input
                    id="spoc"
                    placeholder="Primary contact for this round"
                    value={vcData.spoc}
                    onChange={(e) => handleInputChange("spoc", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={vcData.start_date}
                    onChange={(e) =>
                      handleInputChange("start_date", e.target.value)
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="targeted_end_date">End Date</Label>
                  <Input
                    id="targeted_end_date"
                    type="date"
                    value={vcData.targeted_end_date}
                    onChange={(e) =>
                      handleInputChange("targeted_end_date", e.target.value)
                    }
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="project_description">Reason</Label>
                <Textarea
                  id="project_description"
                  placeholder="Enter reason"
                  value={vcData.project_description}
                  onChange={(e) =>
                    handleInputChange("project_description", e.target.value)
                  }
                  rows={4}
                />
              </div>

              {/* Template Selection - Moved to bottom */}
              <div className="border-t pt-6 mt-6">
                <h4 className="text-lg font-medium text-gray-900 mb-4">
                  Template Selection
                </h4>

                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="template">
                      Choose Template (4 available)
                      {templatesLoading && (
                        <span className="text-blue-500">(Loading...)</span>
                      )}
                      {templatesError && (
                        <span className="text-red-500">(Error)</span>
                      )}
                      {!templatesLoading && !templatesError && (
                        <span className="text-green-500">
                          ({templates.length} available)
                        </span>
                      )}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 mt-1">
                    <Select
                      value={selectedTemplate}
                      onValueChange={(value) => {
                        setSelectedTemplate(value);
                        handleInputChange(
                          "template_id",
                          value === "manual" ? "" : value,
                        );
                      }}
                      disabled={templatesLoading}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue
                          placeholder={
                            templatesLoading
                              ? "Loading templates..."
                              : templatesError
                                ? "Failed to load templates"
                                : "Select a VC template or use manual"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">
                          Manual (Create from scratch)
                        </SelectItem>
                        {templates.map((template: any) => (
                          <SelectItem
                            key={template.id}
                            value={template.id.toString()}
                          >
                            {template.name}
                          </SelectItem>
                        ))}
                        {templates.length === 0 && !templatesLoading && (
                          <SelectItem value="no-templates" disabled>
                            {templatesError
                              ? `Error: ${templatesError.message}`
                              : "No VC templates available"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {selectedTemplate && selectedTemplate !== "manual" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (templateDetails) {
                            setPreviewTemplate(templateDetails);
                            setIsTemplatePreviewOpen(true);
                          }
                        }}
                        disabled={templateDetailsLoading}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Select a VC-specific template to automatically configure
                    workflow steps for this round.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handlePreviousTab}
              disabled={isFirstTab}
            >
              Previous
            </Button>
            <Button onClick={handleNextTab} disabled={isLastTab}>
              Next
            </Button>
          </div>
        </TabsContent>

        {/* Additional Tab */}
        <TabsContent value="additional" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
              <CardDescription>
                Any additional notes, documents, or configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="probability">Success Probability (%)</Label>
                <Input
                  id="probability"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={vcData.probability}
                  onChange={(e) =>
                    handleInputChange("probability", e.target.value)
                  }
                />
                <p className="text-sm text-gray-500 mt-1">
                  Default: 0% - Estimate the likelihood of closing this VC
                  opportunity
                </p>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes about this VC opportunity..."
                  value={vcData.notes}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handlePreviousTab}
              disabled={isFirstTab}
            >
              Previous
            </Button>
            <Button onClick={handleNextTab} disabled={isLastTab}>
              Next
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Error Display */}
      {Object.keys(errors).length > 0 && (
        <Alert className="mt-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please fix the following errors:
            <ul className="list-disc list-inside mt-2">
              {Object.values(errors).map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Template Preview Modal */}
      <TemplatePreviewModal
        isOpen={isTemplatePreviewOpen}
        onClose={() => setIsTemplatePreviewOpen(false)}
        template={previewTemplate}
      />
    </div>
  );
}
