import React, { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Upload,
  AlertCircle,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api";
import * as XLSX from "xlsx";
import { Checkbox } from "@/components/ui/checkbox";

const TEMPLATE_HEADERS = [
  "Source",
  "Source Value",
  "Client Name",
  "Client Type",
  "Payment Offering",
  "Website",
  "Client Geography",
  "Txn Volume / per day in million",
  "Product Tag Info",
  "Street Address",
  "City",
  "State",
  "Country",
  "Contact Name",
  "Designation",
  "Phone Prefix",
  "Contact Phone",
  "Contact Email",
  "LinkedIn Profile Link",
];

const VALID_SOURCES = [
  "LinkedIn - Outbound",
  "LinkedIn - Inbound",
  "Email - Outbound",
  "Email - Inbound",
  "Call - Outbound",
  "Call - Inbound",
  "Existing Client",
  "Business Team",
  "Reference",
  "General List",
];

const PHONE_PREFIXES = [
  { code: "+1", label: "+1 (US)" },
  { code: "+44", label: "+44 (UK)" },
  { code: "+91", label: "+91 (IN)" },
  { code: "+971", label: "+971 (UAE)" },
  { code: "+61", label: "+61 (AU)" },
  { code: "+65", label: "+65 (SG)" },
  { code: "+81", label: "+81 (JP)" },
  { code: "+49", label: "+49 (DE)" },
];

function normalizeSource(source: string | undefined): string | undefined {
  if (!source) return source;
  const trimmed = source.trim();
  const normalized = trimmed.replace(/-/g, " - ");
  return VALID_SOURCES.includes(normalized) ? normalized : trimmed;
}

function normalizePhonePrefix(prefix: string | undefined): string {
  if (!prefix) return "+91";
  const trimmed = prefix.trim();
  if (trimmed.startsWith("+")) {
    return trimmed;
  }
  return "+" + trimmed;
}

interface ImportClientRow {
  source?: string;
  sourceValue?: string;
  clientName: string;
  clientType?: string;
  paymentOffering?: string;
  website?: string;
  geography?: string;
  txnVolume?: string;
  productTagInfo?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  contacts?: Array<{
    contact_name: string;
    designation?: string;
    phone_prefix?: string;
    phone?: string;
    email?: string;
    linkedin_profile_link?: string;
  }>;
  isDuplicate?: boolean;
  duplicateOf?: string;
}

interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

interface DuplicateInfo {
  clientName: string;
  count: number;
  contacts: Array<{
    name: string;
    email?: string;
    phone?: string;
  }>;
}

function createContactFingerprint(contact: any): string {
  const name = (contact.contact_name || "").toLowerCase().trim();
  const email = (contact.email || "").toLowerCase().trim();
  const phone = (contact.phone || "").toLowerCase().trim();
  return `${name}|${email}|${phone}`;
}

function createClientFingerprint(client: ImportClientRow): string {
  const name = client.clientName.toLowerCase().trim();
  return name;
}

function detectDuplicatesInBatch(rows: ImportClientRow[]): {
  dedupedRows: ImportClientRow[];
  duplicateInfo: DuplicateInfo[];
} {
  const seen = new Map<string, ImportClientRow>();
  const duplicates = new Map<string, DuplicateInfo>();
  const dedupedRows: ImportClientRow[] = [];

  for (const row of rows) {
    const fingerprint = createClientFingerprint(row);

    if (seen.has(fingerprint)) {
      const existingRow = seen.get(fingerprint)!;
      row.isDuplicate = true;
      row.duplicateOf = existingRow.clientName;

      if (!duplicates.has(fingerprint)) {
        duplicates.set(fingerprint, {
          clientName: row.clientName,
          count: 2,
          contacts: [
            ...(existingRow.contacts || []).map((c) => ({
              name: c.contact_name,
              email: c.email,
              phone: c.phone,
            })),
            ...(row.contacts || []).map((c) => ({
              name: c.contact_name,
              email: c.email,
              phone: c.phone,
            })),
          ],
        });
      } else {
        const dupInfo = duplicates.get(fingerprint)!;
        dupInfo.count++;
        dupInfo.contacts.push(
          ...(row.contacts || []).map((c) => ({
            name: c.contact_name,
            email: c.email,
            phone: c.phone,
          })),
        );
      }
    } else {
      seen.set(fingerprint, row);
    }

    dedupedRows.push(row);
  }

  return {
    dedupedRows,
    duplicateInfo: Array.from(duplicates.values()),
  };
}

export function ImportClientsModal({
  open,
  onOpenChange,
  onImportSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: () => void;
}) {
  const [step, setStep] = useState<
    "download" | "upload" | "preview" | "duplicates"
  >("download");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ImportClientRow[]>([]);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo[]>([]);
  const [rowsToImport, setRowsToImport] = useState<Set<number>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const downloadTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Clients");
    XLSX.writeFile(workbook, "client_import_template.xlsx");
  };

  // const parseExcelFile = (file: File) => {
  //   const reader = new FileReader();
  //   reader.onload = (e) => {
  //     try {
  //       const data = new Uint8Array(e.target?.result as ArrayBuffer);
  //       const workbook = XLSX.read(data, { type: "array" });
  //       const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  //       const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  //       if (jsonData.length < 2) {
  //         toast({
  //           title: "Invalid file",
  //           description: "Excel file must have headers and at least one row",
  //           variant: "destructive",
  //         });
  //         return;
  //       }

  //       const headers = jsonData[0] as string[];
  //       const rows = jsonData.slice(1);

  //       const importedRows: ImportClientRow[] = [];
  //       const validationErrors: ValidationError[] = [];

  //       for (let i = 0; i < rows.length; i++) {
  //         const row = rows[i] as any[];
  //         if (!row || row.every((cell) => cell === undefined || cell === ""))
  //           continue;

  //         const headerMap: Record<string, number> = {};
  //         headers.forEach((header, idx) => {
  //           headerMap[header.toLowerCase().trim()] = idx;
  //         });

  //         const clientName = row[headerMap["client name"]]?.toString().trim();

  //         if (!clientName) {
  //           validationErrors.push({
  //             rowIndex: i + 2,
  //             field: "Client Name",
  //             message: "Client name is required",
  //           });
  //           continue;
  //         }

  //         const importedRow: ImportClientRow = {
  //           source: row[headerMap["source"]]?.toString().trim(),
  //           sourceValue: row[headerMap["source value"]]?.toString().trim(),
  //           clientName,
  //           clientType: row[headerMap["client type"]]?.toString().trim(),
  //           paymentOffering: row[headerMap["payment offering"]]
  //             ?.toString()
  //             .trim(),
  //           website: row[headerMap["website"]]?.toString().trim(),
  //           geography: row[headerMap["client geography"]]?.toString().trim(),
  //           txnVolume: row[headerMap["txn volume / per day in million"]]
  //             ?.toString()
  //             .trim(),
  //           productTagInfo: row[headerMap["product tag info"]]
  //             ?.toString()
  //             .trim(),
  //           address: row[headerMap["street address"]]?.toString().trim(),
  //           city: row[headerMap["city"]]?.toString().trim(),
  //           state: row[headerMap["state"]]?.toString().trim(),
  //           country: row[headerMap["country"]]?.toString().trim(),
  //           contacts: [],
  //         };

  //         const contactName = row[headerMap["contact name"]]?.toString().trim();
  //         if (contactName) {
  //           importedRow.contacts = [
  //             {
  //               contact_name: contactName,
  //               designation: row[headerMap["designation"]]?.toString().trim(),
  //               phone_prefix:
  //                 row[headerMap["phone prefix"]]?.toString().trim() || "+91",
  //               phone: row[headerMap["contact phone"]]?.toString().trim(),
  //               email: row[headerMap["contact email"]]?.toString().trim(),
  //               linkedin_profile_link: row[headerMap["linkedin profile link"]]
  //                 ?.toString()
  //                 .trim(),
  //             },
  //           ];
  //         }

  //         importedRows.push(importedRow);
  //       }

  //       if (validationErrors.length > 0) {
  //         setErrors(validationErrors);
  //         toast({
  //           title: "Validation errors found",
  //           description: `${validationErrors.length} row(s) have errors`,
  //           variant: "destructive",
  //         });
  //         return;
  //       }

  //       const { dedupedRows, duplicateInfo: dupes } =
  //         detectDuplicatesInBatch(importedRows);

  //       setParsedData(dedupedRows);
  //       setDuplicateInfo(dupes);

  //       if (dupes.length > 0) {
  //         setSkipDuplicates(true);
  //         const rowsToAdd = new Set<number>();
  //         dedupedRows.forEach((row, idx) => {
  //           if (!row.isDuplicate) {
  //             rowsToAdd.add(idx);
  //           }
  //         });
  //         setRowsToImport(rowsToAdd);
  //         setStep("duplicates");
  //       } else {
  //         const allRows = new Set<number>();
  //         dedupedRows.forEach((_, idx) => allRows.add(idx));
  //         setRowsToImport(allRows);
  //         setStep("preview");
  //       }
  //     } catch (error) {
  //       toast({
  //         title: "Failed to parse file",
  //         description:
  //           error instanceof Error ? error.message : "Unknown error occurred",
  //         variant: "destructive",
  //       });
  //     }
  //   };
  //   reader.readAsArrayBuffer(file);
  // };

  const parseExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length < 2) {
          toast({
            title: "Invalid file",
            description: "Excel file must have headers and at least one row",
            variant: "destructive",
          });
          return;
        }

        const headers = jsonData[0] as string[];
        const rows = jsonData.slice(1);

        const validationErrors: ValidationError[] = [];
        const clientMap = new Map<string, ImportClientRow>();

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i] as any[];
          if (!row || row.every((cell) => cell === undefined || cell === ""))
            continue;

          const headerMap: Record<string, number> = {};
          headers.forEach((header, idx) => {
            headerMap[header.toLowerCase().trim()] = idx;
          });

          const clientName = row[headerMap["client name"]]?.toString().trim();
          if (!clientName) {
            validationErrors.push({
              rowIndex: i + 2,
              field: "Client Name",
              message: "Client name is required",
            });
            continue;
          }

          // Check if client already exists
          let existingClient = clientMap.get(clientName);

          if (!existingClient) {
            // Create new client entry
            existingClient = {
              source: normalizeSource(row[headerMap["source"]]?.toString()),
              sourceValue: row[headerMap["source value"]]?.toString().trim(),
              clientName,
              clientType: row[headerMap["client type"]]?.toString().trim(),
              paymentOffering: row[headerMap["payment offering"]]
                ?.toString()
                .trim(),
              website: row[headerMap["website"]]?.toString().trim(),
              geography: row[headerMap["client geography"]]?.toString().trim(),
              txnVolume: row[headerMap["txn volume / per day in million"]]
                ?.toString()
                .trim(),
              productTagInfo: row[headerMap["product tag info"]]
                ?.toString()
                .trim(),
              address: row[headerMap["street address"]]?.toString().trim(),
              city: row[headerMap["city"]]?.toString().trim(),
              state: row[headerMap["state"]]?.toString().trim(),
              country: row[headerMap["country"]]?.toString().trim(),
              contacts: [],
            };
            clientMap.set(clientName, existingClient);
          }

          // Handle contact
          const contactName = row[headerMap["contact name"]]?.toString().trim();
          if (contactName) {
            existingClient.contacts.push({
              contact_name: contactName,
              designation: row[headerMap["designation"]]?.toString().trim(),
              phone_prefix: normalizePhonePrefix(
                row[headerMap["phone prefix"]]?.toString(),
              ),
              phone: row[headerMap["contact phone"]]?.toString().trim(),
              email: row[headerMap["contact email"]]?.toString().trim(),
              linkedin_profile_link: row[headerMap["linkedin profile link"]]
                ?.toString()
                .trim(),
            });
          }
        }

        if (validationErrors.length > 0) {
          setErrors(validationErrors);
          toast({
            title: "Validation errors found",
            description: `${validationErrors.length} row(s) have errors`,
            variant: "destructive",
          });
          return;
        }

        // Convert map to array
        const importedRows = Array.from(clientMap.values());

        // Detect duplicates in merged data
        const { dedupedRows, duplicateInfo: dupes } =
          detectDuplicatesInBatch(importedRows);

        setParsedData(dedupedRows);
        setDuplicateInfo(dupes);

        if (dupes.length > 0) {
          setSkipDuplicates(true);
          const rowsToAdd = new Set<number>();
          dedupedRows.forEach((row, idx) => {
            if (!row.isDuplicate) rowsToAdd.add(idx);
          });
          setRowsToImport(rowsToAdd);
          setStep("duplicates");
        } else {
          const allRows = new Set<number>();
          dedupedRows.forEach((_, idx) => allRows.add(idx));
          setRowsToImport(allRows);
          setStep("preview");
        }
      } catch (error) {
        toast({
          title: "Failed to parse file",
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
          variant: "destructive",
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !file.name.endsWith(".xlsx") &&
      !file.name.endsWith(".xls") &&
      !file.name.endsWith(".csv")
    ) {
      toast({
        title: "Invalid file type",
        description: "Please upload an Excel file (.xlsx, .xls) or CSV",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    parseExcelFile(file);
  };
function sanitize(value: any): string {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // remove zero-width spaces
    .replace(/\u00A0/g, "")                // remove non-breaking spaces
    .replace(/\s+$/g, "")                  // remove trailing spaces/newlines
    .trim();
}
function isValidEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}

  const importMutation = useMutation({
  mutationFn: async (clients: ImportClientRow[]) => {
  const results = [];

  // Helper functions
  const sanitize = (str?: string): string => str?.trim() || "";

  const isValidEmail = (email: string): boolean => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const sanitizePhone = (phone?: string): string | undefined => {
    if (!phone) return undefined;

    // Take only the first number if multiple provided
    const first = phone.split(/[,/]/)[0];

    // Remove all non-digit characters except leading +
    const cleaned = first.replace(/[^\d+]/g, "");

    // Return undefined if too short
    return cleaned.length >= 7 ? cleaned : undefined;
  };

  for (const client of clients) {
    const primaryContact =
      client.contacts && client.contacts.length > 0
        ? client.contacts[0]
        : null;

    // Clean & validate email
    const rawEmail = sanitize(primaryContact?.email);
    const emailToSend = rawEmail && isValidEmail(rawEmail) ? rawEmail : undefined;

    const payload: any = {
      client_name: sanitize(client.clientName),
      contact_person: sanitize(primaryContact?.contact_name),
      email: emailToSend,
      phone: sanitizePhone(primaryContact?.phone),
      address: sanitize(client.address),
      city: sanitize(client.city),
      state: sanitize(client.state),
      country: sanitize(client.country),
      status: "active",
      notes: JSON.stringify({
        source: client.source || "Bulk Import",
        source_value: client.sourceValue,
        client_type: client.clientType,
        payment_offerings: client.paymentOffering
          ? client.paymentOffering.split(",").map((s) => sanitize(s))
          : [],
        website: sanitize(client.website),
        geography: client.geography,
        txn_volume: client.txnVolume,
        product_tag_info: client.productTagInfo,
        contacts: (client.contacts || []).map((c) => ({
          ...c,
          contact_name: sanitize(c.contact_name),
          email:
            c.email && isValidEmail(sanitize(c.email))
              ? sanitize(c.email)
              : undefined,
          phone: sanitizePhone(c.phone),
        })),
      }),
    };

    console.log("Payload being sent:", payload);

    const result = await apiClient.request("/clients", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    results.push(result);
  }

  return results;
},


    onSuccess: (results) => {
      toast({
        title: "Import successful",
        description: `${results.length} client(s) imported successfully`,
      });
      setParsedData([]);
      setErrors([]);
      setSelectedFile(null);
      setDuplicateInfo([]);
      setRowsToImport(new Set());
      setStep("download");
      onImportSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description:
          error?.message || "Failed to import clients. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    const clientsToImport = Array.from(rowsToImport).map(
      (idx) => parsedData[idx],
    );

    if (clientsToImport.length === 0) {
      toast({
        title: "No clients to import",
        description: "Please select at least one client to import",
        variant: "destructive",
      });
      return;
    }

    importMutation.mutate(clientsToImport);
  };

  const toggleRowSelection = (idx: number) => {
    const newSet = new Set(rowsToImport);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setRowsToImport(newSet);
  };

  const selectAllNonDuplicates = () => {
    const nonDupes = new Set<number>();
    parsedData.forEach((row, idx) => {
      if (!row.isDuplicate) {
        nonDupes.add(idx);
      }
    });
    setRowsToImport(nonDupes);
  };

  const selectAll = () => {
    const all = new Set<number>();
    parsedData.forEach((_, idx) => all.add(idx));
    setRowsToImport(all);
  };

  const selectNone = () => {
    setRowsToImport(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Clients</DialogTitle>
          <DialogDescription>
            Download the template, add your client data, and upload to import
            multiple clients at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === "download" && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="text-center space-y-4">
                    <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-8">
                      <Download className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Step 1: Download Template
                      </h3>
                      <p className="text-gray-600 mb-4">
                        Start by downloading the Excel template with the correct
                        headers
                      </p>
                      <Button onClick={downloadTemplate} className="gap-2">
                        <Download className="w-4 h-4" />
                        Download Template
                      </Button>
                    </div>

                    <div className="relative py-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">
                          Then
                        </span>
                      </div>
                    </div>

                    <div className="bg-green-50 border-2 border-dashed border-green-300 rounded-lg p-8">
                      <Upload className="w-12 h-12 text-green-600 mx-auto mb-4" />
                      <h3 className="font-semibold text-gray-900 mb-2">
                        Step 2: Upload File
                      </h3>
                      <p className="text-gray-600 mb-4">
                        After adding your data, upload the file here
                      </p>
                      <Input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileSelect}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <strong>Template Instructions:</strong>
                    <ul className="mt-2 space-y-1 list-disc list-inside">
                      <li>
                        <strong>Required:</strong> Client Name (must be unique
                        per import)
                      </li>
                      <li>
                        <strong>Source & Source Value:</strong> Select from:
                        LinkedIn-Outbound, LinkedIn-Inbound, Email-Outbound,
                        Email-Inbound, Call-Outbound, Call-Inbound, Existing
                        Client, Business Team, Reference, General List
                      </li>
                      <li>
                        <strong>Payment Offering:</strong> For multiple values,
                        separate with commas (e.g., "Online Payments, UPI
                        Payments")
                      </li>
                      <li>
                        <strong>Client Geography:</strong> Choose: Domestic or
                        International
                      </li>
                      <li>
                        <strong>Multiple Contacts:</strong> Create separate rows
                        with the same client name for additional contacts. Each
                        row will be merged into one client with all contacts.
                      </li>
                      <li>
                        <strong>Phone Prefix:</strong> Defaults to +91 if not
                        specified
                      </li>
                      <li>
                        <strong>Duplicate Detection:</strong> The system will
                        detect duplicate client names and warn you before import
                      </li>
                      <li>All other fields are optional</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "duplicates" && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Duplicate Clients Detected!</strong>
                  <p className="text-sm mt-1">
                    {duplicateInfo.length} duplicate client(s) found in your
                    import file. Select which clients to import below.
                  </p>
                </AlertDescription>
              </Alert>

              {duplicateInfo.map((dup, idx) => (
                <Card key={idx} className="border-orange-200 bg-orange-50">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-orange-900">
                      {dup.clientName} ({dup.count} occurrences)
                    </h4>
                    <p className="text-sm text-orange-800 mt-2">
                      Contacts in this batch:
                    </p>
                    <ul className="text-sm text-orange-800 mt-1 list-disc list-inside">
                      {dup.contacts.map((contact, cidx) => (
                        <li key={cidx}>
                          {contact.name}
                          {contact.email && ` (${contact.email})`}
                          {contact.phone && ` - ${contact.phone}`}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <strong>Options:</strong>
                    <ul className="mt-2 space-y-2">
                      <li>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={skipDuplicates}
                            onCheckedChange={(checked) =>
                              setSkipDuplicates(checked as boolean)
                            }
                          />
                          Skip all duplicates and import only unique clients
                        </label>
                      </li>
                      {!skipDuplicates && (
                        <li className="text-yellow-700">
                          ⚠️ Warning: Importing duplicates may create redundant
                          records in the database
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("download");
                    setParsedData([]);
                    setSelectedFile(null);
                    setDuplicateInfo([]);
                    setRowsToImport(new Set());
                  }}
                >
                  Back
                </Button>
                <Button
                  onClick={() => {
                    if (skipDuplicates) {
                      selectAllNonDuplicates();
                    } else {
                      selectAll();
                    }
                    setStep("preview");
                  }}
                >
                  Continue to Preview
                </Button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Validation Errors:</strong>
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {errors.map((error, idx) => (
                        <div key={idx} className="text-sm">
                          Row {error.rowIndex}: {error.field} - {error.message}
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-900">
                    {rowsToImport.size} of {parsedData.length} client(s)
                    selected for import
                  </p>
                  <p className="text-sm text-green-800">
                    Review the data below and select clients to import
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={selectAll}>
                  Select All
                </Button>
                <Button size="sm" variant="outline" onClick={selectNone}>
                  Deselect All
                </Button>
              </div>

              <div className="overflow-x-auto border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead className="w-[150px]">Client Name</TableHead>
                      <TableHead className="w-[120px]">Type</TableHead>
                      <TableHead className="w-[130px]">Geography</TableHead>
                      <TableHead className="w-[120px]">Source</TableHead>
                      <TableHead className="w-[120px]">Country</TableHead>
                      <TableHead className="w-[100px]">Contacts</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Checkbox
                            checked={rowsToImport.has(idx)}
                            onCheckedChange={() => toggleRowSelection(idx)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">
                          {row.clientName}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.clientType || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.geography || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.source || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.country || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-center">
                          {row.contacts?.length || 0}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.isDuplicate ? (
                            <span className="text-orange-600 text-xs font-medium">
                              Duplicate
                            </span>
                          ) : (
                            <span className="text-green-600 text-xs font-medium">
                              New
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(
                      duplicateInfo.length > 0 ? "duplicates" : "download",
                    );
                    setParsedData([]);
                    setSelectedFile(null);
                    setDuplicateInfo([]);
                    setRowsToImport(new Set());
                  }}
                >
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending || rowsToImport.size === 0}
                >
                  {importMutation.isPending
                    ? "Importing..."
                    : `Submit & Import (${rowsToImport.size})`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
