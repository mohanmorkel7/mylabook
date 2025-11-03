# Quick Start Guide: Import & Contact Management Features

## What's New?

### 1. **Duplicate Detection During Import**

When uploading a bulk import file with duplicate client names, the system now automatically detects them and allows you to:

- **Skip duplicates** (recommended) - Import only unique clients
- **View details** of duplicate clients and their contacts
- **Choose which clients to import** - Select specific clients from the preview

### 2. **Enhanced Contact Management**

The Client Contact Information form now includes:

- **Duplicate contact detection** - Warns about duplicate contact names/emails
- **Contact validation** - Validates email, phone, and LinkedIn URLs
- **Department field** - Select from predefined departments (Finance, Operations, etc.)
- **Reporting To field** - Track manager/superior names
- **Bulk import** - Add multiple contacts at once using a simple text format
- **Quick duplicate** - Copy an existing contact with one click

## Step-by-Step: Importing Clients with Duplicates

### Step 1: Download Template

1. Go to **Clients** → **Import**
2. Click **Download Template**
3. Save the file

### Step 2: Prepare Your Data

Fill in the Excel template with your client data:

```
| Source | Source Value | Client Name | ... | Contact Name | Designation | Email | ... |
| LinkedIn-Outbound | | Acme Corp | ... | John Doe | Director | john@acme.com | ... |
| LinkedIn-Outbound | | Acme Corp | ... | Jane Smith | Manager | jane@acme.com | ... |
```

### Step 3: Upload File

1. Click **Choose File** in the Import dialog
2. Select your Excel file
3. System will parse and detect duplicates

### Step 4: Review Duplicates (if found)

- System shows which clients are duplicated
- Shows contact details for each duplicate
- Choose to **Skip duplicates** (default) or **Import All**

### Step 5: Preview & Select

- Review all clients in the preview table
- Status column shows "New" or "Duplicate"
- Check/uncheck individual clients to import
- Click **Submit & Import** to create selected clients

## Step-by-Step: Adding Multiple Contacts Manually

### Method 1: Add One by One

1. Create a client or go to Client Contact Info tab
2. Fill in first contact details
3. Click **Add Another Contact**
4. Fill in the new contact
5. Repeat as needed

### Method 2: Bulk Import Contacts

1. Click **Bulk Import** button
2. Paste contacts in this format (one per line):
   ```
   Name | Designation | Email | Phone | LinkedIn | Department | ReportingTo
   John Doe | Director | john@company.com | 9876543210 | https://linkedin.com/in/john | Finance | CEO
   Jane Smith | Developer | jane@company.com | 1234567890 | https://linkedin.com/in/jane | Engineering | VP Engineering
   ```
3. Click **Import Contacts**
4. System validates and adds contacts to the form

### Method 3: Quick Duplicate Contact

1. Click the **Copy** button on any contact
2. A duplicate is created with "(Copy)" suffix
3. Edit the copy with new information
4. System warns if names/emails still match (duplicates)

## Duplicate Detection Features

### During Import (Client Level)

- **Matches on**: Client name (case-insensitive)
- **When**: During file upload in the import modal
- **Action**: Shows duplicates review screen, allows skipping
- **Example**: Two rows with "Acme Corp" → Marked as duplicate

### During Form Submission (Contact Level)

- **Matches on**: Contact name + Email (case-insensitive)
- **When**: In real-time as you add contacts
- **Action**: Shows warning with one-click removal option
- **Example**: Two contacts named "John Doe" with same email → Duplicate detected

## Validation Rules

### Required Fields

- ✅ **Contact Name** - Cannot be empty
- ✅ **Designation** - Cannot be empty

### Optional Fields with Validation

- **Email** - Must be valid format (user@domain.com)
- **Phone** - Minimum 7 digits if provided
- **LinkedIn** - Must contain "linkedin.com" if provided

### Error Display

- Invalid fields are highlighted in red
- Click "Show errors" to see all validation issues
- System prevents submission until errors are fixed

## Example: Handling Your Data

### Your Scenario: Morkel & Mohan Contacts

**Excel File:**

```
| Source | Client Name | Contact Name | Designation | Phone Prefix | Contact Phone | Contact Email | LinkedIn Profile Link |
| LinkedIn-Outbound | Mylapay | Morkel | Director | 91 | 9876543212 | mohan.m@mylapay.com | https://linkedin.com/in/morkel |
| LinkedIn-Outbound | Mylapay | Mohan | Developer | 91 | 1234567890 | check@mylapay.com | https://linkedin.com/in/mohan |
```

**Import Process:**

1. Upload this file
2. System detects "Mylapay" appears once (no duplicate at client level)
3. Shows 1 unique client ready to import
4. Preview shows Mylapay with 2 contacts (Morkel & Mohan)
5. Click Submit → Creates 1 client with 2 contacts

**Duplicate Prevention:**

- If you upload the same file twice, system detects duplicate client name
- Shows "Mylapay" with 2 contacts (Morkel, Mohan) in both uploads
- Recommends skipping duplicate
- Only imports unique clients

## Tips & Best Practices

### ✅ Do's

- ✅ Use consistent client names across your organization
- ✅ Include email addresses for better contact identification
- ✅ Assign departments to organize contacts
- ✅ Use the bulk import for large contact lists
- ✅ Review duplicates before importing

### ❌ Don'ts

- ❌ Don't upload the same file multiple times
- ❌ Don't create contacts with very similar names but different emails (might be legitimate variations)
- ❌ Don't leave email/phone fields with invalid formats
- ❌ Don't import without reviewing the preview

## Troubleshooting

### Issue: Duplicates Not Detected

**Cause**: Client names don't match exactly (case-sensitive in some contexts)
**Solution**: Ensure client names are identical, including capitalization

### Issue: Validation Errors on Submit

**Cause**: Invalid email or phone format
**Solution**:

- Email: Use format like `name@company.com`
- Phone: Minimum 7 digits (system removes spaces automatically)

### Issue: Contact Not Showing in Import

**Cause**: Missing required fields in Excel
**Solution**: Ensure Contact Name and Designation are filled for each contact row

### Issue: Department Not Saving

**Info**: Department is optional and saved in contact details
**Check**: It will be visible when viewing client details

## Integration with CRM

All contact information is stored in the client's notes as JSON and includes:

- Complete contact details
- Department assignments
- Reporting relationships
- All custom fields

This allows for:

- Reporting on organizational structure
- Department-level analysis
- Relationship mapping
- Contact history tracking

## Future Enhancements

Coming soon:

- Merge duplicate clients
- Contact history tracking
- Org chart visualization
- Advanced contact search
- Contact export to CSV/vCard

---

**Questions?** The system provides inline help and validation messages throughout the process.
