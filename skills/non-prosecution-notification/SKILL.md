---
description: Generate a "Notice Requiring Explanation of Non-Registration Reasons" (要求说明不立案理由通知书) for People's Procuratorate. Use when users ask to create a non-prosecution explanation letter, require public security organs to explain non-registration reasons, generate procuratorate notice, or fill in non-registration notice templates.
name: non-prosecution-notification
---

# Non-Prosecution Notification Generator

Generate a legally compliant "Notice Requiring Explanation of Non-Registration Reasons" based on the case information provided by the user.

## Required Information Collection

Use GenUI form to collect the following information:

1. **Procuratorate Name** - Full name of the issuing authority (e.g., Beijing Chaoyang District People's Procuratorate)
2. **Case Name** - Specific case name
3. **Public Security Organ Name** - Full name of the receiving public security organ (e.g., Beijing Municipal Public Security Bureau Chaoyang Branch)
4. **Document Number** - Format: "XX Jian Xing Bu Li Tong [Year] XX Hao"
5. **Legal Basis** - Default: Article 113 of the Criminal Procedure Law of the People's Republic of China
6. **Response Deadline** - Default: within 7 days
7. **Document Date** - Issue date of the notice

## Notice Format Specification

### Title
```
要求说明不立案理由通知书
```

### Document Number
Format: `[Procuratorate Abbreviation] Jian Xing Bu Li Tong [Year] Number Hao`
Example: `Jing Chao Jian Xing Bu Li Tong [2024] 15 Hao`

### Body Structure
```
[Procuratorate Name]:

According to Article 113 of the Criminal Procedure Law of the People's Republic of China, please provide a written explanation of the reasons for non-registration of the ________ case to our procuratorate within 7 days of receiving this notice.
```

### Closing
- Date aligned to the right in the lower right corner
- Seal of the People's Procuratorate to be affixed

## Output Format

Generate a formal legal document text using the following format:

1. Title centered and bold
2. Document number left-aligned
3. Recipient unit starts at the top line
4. Body text indented 2 characters
5. Date right-aligned

## Example Output

```
要求说明不立案理由通知书

Jing Chao Jian Xing Bu Li Tong [2024] 15 Hao

Beijing Municipal Public Security Bureau Chaoyang Branch:

According to Article 113 of the Criminal Procedure Law of the People's Republic of China, please provide a written explanation of the reasons for non-registration of the Zhang Moumou intentional injury case to our procuratorate within 7 days of receiving this notice.

                                    March 15, 2024
                                    (Procuratorate Seal)
```

## Important Notes

- All placeholders must be replaced with actual information
- Document number year uses brackets (〔 〕) in Chinese style
- Date format uses Chinese "Year Month Day" format
- Body text must explicitly cite specific legal provisions
- Language should be concise, accurate, and formal, complying with legal document style
