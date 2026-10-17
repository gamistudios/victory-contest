package http

import (
	"bytes"
	"encoding/csv"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// csvSafe neutralises spreadsheet formula injection: a cell that starts with
// = + - @ (or a tab/CR) is prefixed with an apostrophe so Excel/Sheets treat
// it as text. Region names and student names are user-supplied.
func csvSafe(s string) string {
	if s == "" {
		return s
	}
	switch s[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + s
	}
	return s
}

// writeCSV streams a CSV attachment. A UTF-8 BOM is written first so Excel
// opens Amharic text correctly. Every cell passes through csvSafe except when
// the caller has already produced a plain number (numeric strings starting with
// '-' are legitimate, so numbers go through the raw path via numCell).
func writeCSV(c *gin.Context, filename string, header []string, rows [][]string) {
	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF")
	w := csv.NewWriter(&buf)
	_ = w.Write(header)
	for _, r := range rows {
		out := make([]string, len(r))
		for i, cell := range r {
			if strings.HasPrefix(cell, numPrefix) {
				out[i] = strings.TrimPrefix(cell, numPrefix)
			} else {
				out[i] = csvSafe(cell)
			}
		}
		_ = w.Write(out)
	}
	w.Flush()
	if err := w.Error(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not build csv"})
		return
	}
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}

// numPrefix marks a cell as a trusted number (skips csvSafe).
const numPrefix = "\x00num:"

func numCell(s string) string { return numPrefix + s }

func wantsCSV(c *gin.Context) bool { return strings.EqualFold(c.Query("format"), "csv") }
