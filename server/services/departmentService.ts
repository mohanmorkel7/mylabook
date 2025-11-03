import { pool } from "../database/connection";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DEPTS_PATH = path.join(__dirname, "../data/user-departments.json");

export interface Department {
  id: number;
  name: string;
  code: string;
  description?: string;
  permissions: string[];
}

export interface UserDepartmentInfo {
  userId: number;
  email: string;
  department: string;
  permissions: string[];
  jobTitle?: string;
  ssoId?: string;
  surname?: string;
  givenName?: string;
  displayName?: string;
}

export class DepartmentService {
  private static readUserDepartments(): { users: any[]; departments: any } {
    try {
      if (fs.existsSync(USER_DEPTS_PATH)) {
        const content = fs.readFileSync(USER_DEPTS_PATH, "utf8");
        const data = JSON.parse(content);
        return {
          users: Array.isArray(data.users) ? data.users : [],
          departments: data.departments || {},
        };
      }
    } catch (e) {
      console.warn(
        "Could not read user-departments.json:",
        (e as Error).message,
      );
    }
    return { users: [], departments: {} };
  }

  // Map departments to appropriate user roles
  static getDepartmentRole(department: string): string {
    // If no department provided, assign 'unknown' role for manual assignment
    if (
      !department ||
      department === null ||
      department === undefined ||
      department === ""
    ) {
      return "unknown";
    }

    const departmentRoleMap: { [key: string]: string } = {
      hr: "hr_management",
      finance: "finance", // Finance department gets 'finance' role
      finops: "finops", // FinOps department gets 'finops' role
      database: "db",
      frontend: "development",
      backend: "development", // Backend department gets 'development' role (backend not allowed in constraint)
      infra: "infra",
      admin: "admin", // Admin department gets 'admin' role
      administration: "admin",
      switch_team: "switch_team",
      business_analyst:"business_analyst" // Administration department also gets 'admin' role
    };

    return departmentRoleMap[department] || "unknown"; // Default to 'unknown' for unrecognized departments
  }
  // Get user's department and permissions by email
  static async getUserDepartmentByEmail(
    email: string,
  ): Promise<UserDepartmentInfo | null> {
    try {
      const query = `
        SELECT 
          u.id as user_id,
          u.email,
          u.department,
          u.job_title,
          u.sso_id,
          u.last_name as surname,
          u.first_name as givenName,
          (u.first_name || ' ' || u.last_name) AS displayName,
          d.permissions as dept_permissions,
          udp.permissions as additional_permissions
        FROM users u
        LEFT JOIN departments d ON u.department = d.code
        LEFT JOIN user_department_permissions udp ON u.id = udp.user_id AND udp.is_active = true
        WHERE u.email = $1
      `;

      const result = await pool.query(query, [email]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const deptPermissions = row.dept_permissions || [];
      const additionalPermissions = row.additional_permissions || [];

      return {
        userId: row.user_id,
        email: row.email,
        department: row.department,
        displayName: row.displayName,
        givenName: row.givenName,
        surname: row.surname,
        permissions: [
          ...new Set([...deptPermissions, ...additionalPermissions]),
        ],
        jobTitle: row.job_title,
        ssoId: row.sso_id,
      };
    } catch (error) {
      console.error("Error getting user department:", error);
      return null;
    }
  }

  // Get user's department and permissions by SSO ID
  static async getUserDepartmentBySSOId(
    ssoId: string,
  ): Promise<UserDepartmentInfo | null> {
    try {
      const query = `
        SELECT 
          u.id as user_id,
          u.email,
          u.department,
          u.job_title,
          u.sso_id,
          u.surname,
          u.givenName,
          u.displayName,
          d.permissions as dept_permissions,
          udp.permissions as additional_permissions
        FROM users u
        LEFT JOIN departments d ON u.department = d.code
        LEFT JOIN user_department_permissions udp ON u.id = udp.user_id AND udp.is_active = true
        WHERE u.sso_id = $1
      `;

      const result = await pool.query(query, [ssoId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const deptPermissions = row.dept_permissions || [];
      const additionalPermissions = row.additional_permissions || [];

      return {
        userId: row.user_id,
        email: row.email,
        department: row.department,
        permissions: [
          ...new Set([...deptPermissions, ...additionalPermissions]),
        ],
        jobTitle: row.job_title,
        ssoId: row.sso_id,
      };
    } catch (error) {
      console.error("Error getting user department by SSO ID:", error);
      return null;
    }
  }

  // Create or update user from SSO login
  static async createOrUpdateSSOUser(
    ssoUser: any,
  ): Promise<UserDepartmentInfo | null> {
    try {
      if (!ssoUser || !ssoUser.mail) {
        console.warn("SSO user missing email. Skipping create/update.");
        return null;
      }
      console.log(`🔧 createOrUpdateSSOUser called for: ${ssoUser.mail}`);

      // Find user in our department mapping (fresh read from disk)
      const { users } = this.readUserDepartments();
      let userMapping = users.find(
        (u: any) =>
          String(u.email || "").toLowerCase() ===
          String(ssoUser.mail || "").toLowerCase(),
      );

      if (!userMapping) {
        console.warn(`❌ User ${ssoUser.mail} not found in department mapping`);
        try {
          const { users: allUsers } = this.readUserDepartments();
          console.log(
            `Available users in mapping: ${allUsers.map((u: any) => u.email).join(", ")}`,
          );
        } catch {}

        // Fall back to checking the database for existing user info
        try {
          const dbUserInfo = await this.getUserDepartmentByEmail(ssoUser.mail);
          if (dbUserInfo) {
            console.log(
              `ℹ️ Found user in database for ${ssoUser.mail}, using DB info`,
              JSON.stringify(dbUserInfo),
            );
            // Build a minimal userMapping from DB info for consistent processing below
            const fallbackMapping: any = {
              email: dbUserInfo.email,
              givenName: dbUserInfo.givenName,
              surname: dbUserInfo.surname,
              displayName: dbUserInfo.displayName,
              department: dbUserInfo.department,
              ssoId: dbUserInfo.ssoId,
              jobTitle: dbUserInfo.jobTitle,
            };

            console.log(`✅ Using fallback mapping for ${ssoUser.mail}:`, {
              department: fallbackMapping.department,
              role: this.getDepartmentRole(fallbackMapping.department),
            });

            // assign to userMapping variable so rest of flow continues
            userMapping = fallbackMapping as any;
          } else {
            // Nothing to do
            return null;
          }
        } catch (err) {
          console.error(
            "Error while falling back to DB lookup for SSO user:",
            err,
          );
          return null;
        }
      }

      console.log(`✅ Found user mapping for ${ssoUser.mail}:`, {
        department: userMapping.department,
        role: this.getDepartmentRole(userMapping.department),
        hasGivenName: !!userMapping.givenName,
        hasSurname: !!userMapping.surname,
      });

      // Validate required fields and log any issues
      if (!userMapping.givenName && !userMapping.displayName) {
        console.warn(`User ${ssoUser.mail} missing givenName and displayName`);
      }
      if (!userMapping.surname && !userMapping.displayName) {
        console.warn(
          `User ${ssoUser.mail} missing surname and displayName for fallback`,
        );
      }

      // Check if user exists
      const existingUser = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [ssoUser.mail],
      );

      let userId: number;

      if (existingUser.rows.length > 0) {
        // Update existing user but preserve DB values when SSO/mapping doesn't provide them

        console.log("Existing User");
        userId = existingUser.rows[0].id;

        // Read current DB values to avoid overwriting with empty/unknown values
        const existingFull = await pool.query(
          `SELECT first_name, last_name, department, azure_object_id, job_title, sso_provider FROM users WHERE id = $1`,
          [userId],
        );
        const existingRow = existingFull.rows[0] || {};

        const newFirstName =
          userMapping.givenName && String(userMapping.givenName).trim()
            ? userMapping.givenName
            : existingRow.first_name ||
              (userMapping.displayName
                ? String(userMapping.displayName).split(" ")[0]
                : "Unknown");

        const newLastName =
          userMapping.surname && String(userMapping.surname).trim()
            ? userMapping.surname
            : existingRow.last_name ||
              (userMapping.displayName
                ? String(userMapping.displayName).split(" ").slice(1).join(" ")
                : "User");

        const newDepartment =
          userMapping.department || existingRow.department || null;
        const newAzureId =
          userMapping.ssoId || existingRow.azure_object_id || null;
        const newJobTitle =
          userMapping.jobTitle || existingRow.job_title || "Employee";
        const newProvider = existingRow.sso_provider || "microsoft";

        await pool.query(
          `
          UPDATE users
          SET
            first_name = $1,
            last_name = $2,
            department = $3,
            azure_object_id = $4,
            job_title = $5,
            sso_provider = $6,
            updated_at = NOW()
          WHERE id = $7
        `,
          [
            newFirstName,
            newLastName,
            newDepartment,
            newAzureId,
            newJobTitle,
            newProvider,
            userId,
          ],
        );
      } else {
        // Create new user
        const insertResult = await pool.query(
          `
          INSERT INTO users (
            first_name, last_name, email, password_hash, department, azure_object_id,
            job_title, role, status, sso_provider, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
          RETURNING id
        `,
          [
            userMapping.givenName || userMapping.displayName || "Unknown",
            userMapping.surname ||
              userMapping.displayName?.split(" ").slice(1).join(" ") ||
              "User",
            ssoUser.mail,
            "SSO_AUTH_NO_PASSWORD", // Placeholder for SSO users who don't use password auth
            userMapping.department,
            userMapping.ssoId,
            userMapping.jobTitle || "Employee",
            this.getDepartmentRole(userMapping.department), // Role based on department
            "active",
            "microsoft", // sso_provider
          ],
        );
        userId = insertResult.rows[0].id;
      }

      // Return user department info
      return await this.getUserDepartmentByEmail(ssoUser.mail);
    } catch (error) {
      console.error("Error creating/updating SSO user:", error);
      return null;
    }
  }

  // Check if user has specific permission
  static async userHasPermission(
    userId: number,
    permission: string,
  ): Promise<boolean> {
    try {
      const query = `
        SELECT 1
        FROM users u
        LEFT JOIN departments d ON u.department = d.code
        LEFT JOIN user_department_permissions udp ON u.id = udp.user_id AND udp.is_active = true
        WHERE u.id = $1 
        AND (
          $2 = ANY(d.permissions) 
          OR $2 = ANY(udp.permissions)
        )
      `;

      const result = await pool.query(query, [userId, permission]);
      return result.rows.length > 0;
    } catch (error) {
      console.error("Error checking user permission:", error);
      return false;
    }
  }

  // Get all departments
  static async getAllDepartments(): Promise<Department[]> {
    try {
      const result = await pool.query(
        "SELECT * FROM departments ORDER BY name",
      );
      return result.rows;
    } catch (error) {
      console.error("Error getting departments:", error);
      return [];
    }
  }

  // Load user departments from JSON (for initial setup)
  static async loadUserDepartmentsFromJSON(
    options: { skipExistingUsers?: boolean } = {},
  ): Promise<void> {
    try {
      console.log("Loading user departments from JSON...");
      const { users: allUsersForCount } = this.readUserDepartments();
      console.log(`Total users in JSON to process: ${allUsersForCount.length}`);
      console.log(`Skip existing users: ${options.skipExistingUsers}`);

      // Check database availability first
      let dbAvailable = false;
      try {
        await pool.query("SELECT 1");
        dbAvailable = true;
        console.log("✅ Database is available for user processing");
      } catch (dbError) {
        console.warn(
          "⚠️  Database not available during user processing:",
          dbError.message,
        );
        if (options.skipExistingUsers) {
          console.log(
            "Cannot process users - database required for duplicate checking",
          );
          return;
        }
      }

      let processedCount = 0;
      let skippedCount = 0;
      let updatedCount = 0;

      const { users } = this.readUserDepartments();
      for (const user of users) {
        // Skip entries without an email (likely rooms/resources)
        if (!user.email) {
          console.log(
            `⏭️  Skipping entry without email: ${user.displayName || "unknown"}`,
          );
          skippedCount++;
          continue;
        }

        console.log(
          `🔍 Processing user: ${user.email} (department: ${user.department || "none"})`,
        );

        // If skipExistingUsers is true, check if user exists in database first
        if (options.skipExistingUsers) {
          try {
            const existingUser = await pool.query(
              "SELECT id FROM users WHERE email = $1",
              [user.email],
            );

            console.log(
              `   📋 User ${user.email} exists in DB: ${existingUser.rows.length > 0}`,
            );

            if (existingUser.rows.length > 0) {
              // If user has department info, update them, otherwise skip
              if (user.department && user.department !== "") {
                console.log(
                  `🔄 Updating existing user with department: ${user.email} (${user.department})`,
                );
                const updateResult = await this.createOrUpdateSSOUser({
                  mail: user.email,
                  displayName: user.displayName,
                  givenName: user.givenName,
                  surname: user.surname,
                  jobTitle: user.jobTitle,
                  id: user.ssoId,
                });
                console.log(
                  `   ✅ Update result: ${updateResult ? "success" : "failed"}`,
                );
                updatedCount++;
              } else {
                console.log(
                  `⏭️  Skipping existing user with no department: ${user.email}`,
                );
                skippedCount++;
                continue;
              }
            } else {
              // New user
              console.log(
                `➕ Creating new user: ${user.email} (${user.department})`,
              );
              const createResult = await this.createOrUpdateSSOUser({
                mail: user.email,
                displayName: user.displayName,
                givenName: user.givenName,
                surname: user.surname,
                jobTitle: user.jobTitle,
                id: user.ssoId,
              });
              console.log(
                `   ✅ Create result: ${createResult ? "success" : "failed"}`,
              );
              processedCount++;
            }
          } catch (error) {
            console.warn(`Error processing user: ${user.email}`, error);
          }
        } else {
          // Original behavior - process all users
          await this.createOrUpdateSSOUser({
            mail: user.email,
            displayName: user.displayName,
            givenName: user.givenName,
            surname: user.surname,
            jobTitle: user.jobTitle,
            id: user.ssoId,
          });
          processedCount++;
        }
      }

      if (options.skipExistingUsers) {
        console.log(
          `📊 Database sync summary: ${processedCount} new users, ${updatedCount} updated users, ${skippedCount} skipped users`,
        );
      } else {
        const { users: finalUsers } = this.readUserDepartments();
        console.log(`Loaded ${finalUsers.length} users from JSON`);
      }
    } catch (error) {
      console.error("Error loading users from JSON:", error);
    }
  }
}
