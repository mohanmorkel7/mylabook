import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Minus,
  Mail,
  Phone,
  User,
  Upload,
  AlertTriangle,
  AlertCircle,
  Copy,
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface Contact {
  contact_name: string;
  designation: string;
  phone_prefix?: string;
  phone: string;
  email: string;
  linkedin_profile_link?: string;
  department?: string;
  reportingTo?: string;
}

interface ContactError {
  index: number;
  field: string;
  message: string;
}

interface DuplicateWarning {
  index1: number;
  index2: number;
  name: string;
  email?: string;
}

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

const COMMON_DEPARTMENTS = [
  "Finance",
  "Operations",
  "Technical",
  "Sales",
  "Marketing",
  "HR",
  "Legal",
  "Executive",
  "Product",
  "Engineering",
  "Customer Success",
];

function isValidEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(trimmed);
}

function isValidPhone(phone: string) {
  return /^\d{7,}$/.test(phone.replace(/\s+/g, ""));
}

function createContactFingerprint(contact: Contact): string {
  const name = contact.contact_name.toLowerCase().trim();
  const email = (contact.email || "").toLowerCase().trim();
  return `${name}|${email}`;
}

function detectDuplicateContacts(contacts: Contact[]): DuplicateWarning[] {
  const seen = new Map<string, number>();
  const duplicates: DuplicateWarning[] = [];

  contacts.forEach((contact, idx) => {
    const fingerprint = createContactFingerprint(contact);

    if (seen.has(fingerprint)) {
      const prevIdx = seen.get(fingerprint)!;
      duplicates.push({
        index1: prevIdx,
        index2: idx,
        name: contact.contact_name,
        email: contact.email,
      });
    } else {
      seen.set(fingerprint, idx);
    }
  });

  return duplicates;
}

function validateContacts(contacts: Contact[]): ContactError[] {
  const errors: ContactError[] = [];

  contacts.forEach((contact, idx) => {
    if (!contact.contact_name.trim()) {
      errors.push({
        index: idx,
        field: "Contact Name",
        message: "Contact name is required",
      });
    }

    if (!contact.designation.trim()) {
      errors.push({
        index: idx,
        field: "Designation",
        message: "Designation is required",
      });
    }

    if (contact.email && contact.email.trim() !== "" && !isValidEmail(contact.email)) {
  errors.push({
    index: idx,
    field: "Email",
    message: "Invalid email format",
  });
}


    if (contact.phone && !isValidPhone(contact.phone)) {
      errors.push({
        index: idx,
        field: "Phone",
        message: "Phone must have at least 7 digits",
      });
    }

    if (
      contact.linkedin_profile_link &&
      !contact.linkedin_profile_link.includes("linkedin.com")
    ) {
      errors.push({
        index: idx,
        field: "LinkedIn",
        message: "Must be a valid LinkedIn URL",
      });
    }
  });

  return errors;
}

export function ClientContactInformationSection({
  contacts,
  onContactsChange,
}: {
  contacts: Contact[];
  onContactsChange: (contacts: Contact[]) => void;
}) {
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  const validationErrors = useMemo(
    () => validateContacts(contacts),
    [contacts],
  );

  const duplicateWarnings = useMemo(
    () => detectDuplicateContacts(contacts),
    [contacts],
  );

  const hasErrors = validationErrors.length > 0;
  const hasDuplicates = duplicateWarnings.length > 0;

  const updateContact = (idx: number, key: keyof Contact, value: string) => {
    onContactsChange(
      contacts.map((c, i) => (i === idx ? { ...c, [key]: value } : c)),
    );
  };

  const addContact = () => {
    onContactsChange([
      ...contacts,
      {
        contact_name: "",
        designation: "",
        phone_prefix: "+91",
        phone: "",
        email: "",
        linkedin_profile_link: "",
        department: "",
        reportingTo: "",
      },
    ]);
  };

  const removeContact = (idx: number) => {
    if (contacts.length === 1) {
      toast({
        title: "Cannot remove",
        description: "At least one contact is required",
        variant: "destructive",
      });
      return;
    }
    onContactsChange(contacts.filter((_, i) => i !== idx));
  };

  const duplicateContact = (idx: number) => {
    const contact = contacts[idx];
    onContactsChange([
      ...contacts,
      {
        ...contact,
        contact_name: contact.contact_name + " (Copy)",
      },
    ]);
    toast({
      title: "Contact duplicated",
      description: "Edit the copy and update the name",
    });
  };

  const removeDuplicate = (idx: number) => {
    removeContact(idx);
  };

  const handleBulkImport = () => {
    const lines = bulkText.split("\n").filter((l) => l.trim());
    const newContacts: Contact[] = [];

    for (const line of lines) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 3) continue;

      newContacts.push({
        contact_name: parts[0],
        designation: parts[1],
        email: parts[2],
        phone: parts[3] || "",
        phone_prefix: "+91",
        linkedin_profile_link: parts[4] || "",
        department: parts[5] || "",
        reportingTo: parts[6] || "",
      });
    }

    if (newContacts.length === 0) {
      toast({
        title: "No valid contacts",
        description:
          "Please use format: Name | Designation | Email | Phone | LinkedIn | Department | ReportingTo",
        variant: "destructive",
      });
      return;
    }

    const merged = [...contacts, ...newContacts];
    onContactsChange(merged);
    setBulkText("");
    setBulkImportOpen(false);
    toast({
      title: "Contacts imported",
      description: `${newContacts.length} contact(s) added`,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="w-5 h-5" /> Client Contact Information
        </CardTitle>
        <CardDescription>
          Primary and additional contacts ({contacts.length})
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasDuplicates && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Duplicate Contacts Detected:</strong>
              <div className="mt-2 space-y-1 text-sm">
                {duplicateWarnings.map((dup, idx) => (
                  <div key={idx}>
                    Contact #{dup.index1 + 1} and #{dup.index2 + 1}:{" "}
                    <strong>{dup.name}</strong>
                    {dup.email && ` (${dup.email})`} appear to be duplicates.
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-2 h-auto py-0 px-2"
                      onClick={() => removeDuplicate(dup.index2)}
                    >
                      Remove duplicate
                    </Button>
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {hasErrors && showValidationErrors && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Validation Errors:</strong>
              <div className="mt-2 space-y-1 text-sm max-h-48 overflow-y-auto">
                {validationErrors.map((error, idx) => (
                  <div key={idx}>
                    Contact #{error.index + 1} - {error.field}: {error.message}
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {contacts.map((c, idx) => (
          <div key={idx} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">Contact #{idx + 1}</Badge>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => duplicateContact(idx)}
                  title="Duplicate this contact"
                >
                  <Copy className="w-4 h-4" />
                </Button>
                {contacts.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeContact(idx)}
                  >
                    <Minus className="w-4 h-4 mr-1" /> Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Contact Name *</Label>
                <Input
                  value={c.contact_name}
                  onChange={(e) =>
                    updateContact(idx, "contact_name", e.target.value)
                  }
                  placeholder="Full name"
                  className={
                    validationErrors.some(
                      (e) => e.index === idx && e.field === "Contact Name",
                    )
                      ? "border-red-500"
                      : ""
                  }
                />
              </div>
              <div>
                <Label>Designation *</Label>
                <Input
                  value={c.designation}
                  onChange={(e) =>
                    updateContact(idx, "designation", e.target.value)
                  }
                  placeholder="Job title"
                  className={
                    validationErrors.some(
                      (e) => e.index === idx && e.field === "Designation",
                    )
                      ? "border-red-500"
                      : ""
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Department</Label>
                <Select
                  value={c.department || ""}
                  onValueChange={(v) => updateContact(idx, "department", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_DEPARTMENTS.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reporting To</Label>
                <Input
                  value={c.reportingTo || ""}
                  onChange={(e) =>
                    updateContact(idx, "reportingTo", e.target.value)
                  }
                  placeholder="Manager/Superior name"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    className={`pl-10 ${
                      validationErrors.some(
                        (e) => e.index === idx && e.field === "Email",
                      )
                        ? "border-red-500"
                        : ""
                    }`}
                    value={c.email}
                    onChange={(e) =>
                      updateContact(idx, "email", e.target.value)
                    }
                    placeholder="name@company.com"
                  />
                </div>
              </div>
              <div>
                <Label>Phone</Label>
                <div className="flex gap-2">
                  <Select
                    value={c.phone_prefix || "+91"}
                    onValueChange={(v) => updateContact(idx, "phone_prefix", v)}
                  >
                    <SelectTrigger className="w-[140px]">
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
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      className={`pl-10 ${
                        validationErrors.some(
                          (e) => e.index === idx && e.field === "Phone",
                        )
                          ? "border-red-500"
                          : ""
                      }`}
                      value={c.phone}
                      onChange={(e) =>
                        updateContact(idx, "phone", e.target.value)
                      }
                      placeholder="98765 43210"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label>LinkedIn Profile Link</Label>
              <Input
                value={c.linkedin_profile_link || ""}
                onChange={(e) =>
                  updateContact(idx, "linkedin_profile_link", e.target.value)
                }
                placeholder="https://linkedin.com/in/..."
                type="url"
                className={
                  validationErrors.some(
                    (e) => e.index === idx && e.field === "LinkedIn",
                  )
                    ? "border-red-500"
                    : ""
                }
              />
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={addContact}>
            <Plus className="w-4 h-4 mr-1" /> Add Another Contact
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setBulkImportOpen(true)}
          >
            <Upload className="w-4 h-4 mr-1" /> Bulk Import
          </Button>
        </div>

        {hasErrors && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Please fix validation errors before submitting</strong>
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 h-auto py-0 px-2"
                onClick={() => setShowValidationErrors(true)}
              >
                Show errors
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <Dialog open={bulkImportOpen} onOpenChange={setBulkImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Import Contacts</DialogTitle>
            <DialogDescription>
              Paste contacts in the format: Name | Designation | Email | Phone |
              LinkedIn | Department | ReportingTo (separated by line breaks)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
              <strong>Example:</strong>
              <div className="mt-2 font-mono">
                John Doe | Director | john@company.com | 9876543210 |
                https://linkedin.com/in/john | Finance | CEO
              </div>
            </div>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="Paste contacts here..."
              className="w-full h-32 p-2 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkImport}>Import Contacts</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
