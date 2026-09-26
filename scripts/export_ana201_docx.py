#!/usr/bin/env python3
"""
ANA 201: Muscles of the Upper Limb - Word (.docx) Exporter
Generates a standard international medical & anatomy quiz competition formatted Word document:
- Cover page & Course Metadata (ANA 201: Upper and Lower Limb)
- Section-based demarcation:
  * SECTION I: PECTORAL GIRDLE & SHOULDER MUSCULATURE (Q1 – Q25)
  * SECTION II: ARM MUSCULATURE (BRACHIUM) (Q26 – Q45)
  * SECTION III: ANTERIOR FOREARM MUSCULATURE (Q46 – Q47)
- Single-column portrait layout with clean typography
- Multiple choice options (A, B, C, D) indented
- Compact Answer Key Table
- Comprehensive Medical Explanations Appendix
"""

import os
import json
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

OPTIONS_LETTERS = ['A', 'B', 'C', 'D']

def format_run(run, font_name="Calibri", size_pt=10.5, bold=False, italic=False, color_rgb=None):
    run.font.name = font_name
    run.font.size = Pt(size_pt)
    run.bold = bold
    run.italic = italic
    if color_rgb:
        run.font.color.rgb = color_rgb

def set_cell_shading(cell, fill_hex):
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading)

def set_table_borders(table, color="CBD5E0"):
    tblPr = table._tbl.tblPr
    borders = parse_xml(f'''
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
            <w:bottom w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
            <w:left w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
            <w:right w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
        </w:tblBorders>
    ''')
    tblPr.append(borders)

def build_docx(input_file="data/university/anatomy/200/questions-ana201-muscles.json", output_file="exports/ANA_201_Muscles_of_the_Upper_Limb.docx"):
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    questions = data["questions"]
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    doc = Document()
    
    # 0.75 in margins
    for s in doc.sections:
        s.top_margin = Inches(0.75)
        s.bottom_margin = Inches(0.75)
        s.left_margin = Inches(0.75)
        s.right_margin = Inches(0.75)
        
    # Title Header
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(12)
    p_title.paragraph_format.space_after = Pt(4)
    p_title.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
    r_title = p_title.add_run("ANA 201: UPPER & LOWER LIMB")
    format_run(r_title, font_name="Calibri", size_pt=20, bold=True, color_rgb=RGBColor(0x1A, 0x36, 0x5D))
    
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(2)
    p_sub.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
    r_sub = p_sub.add_run("ADVANCED MCQS ON MUSCLES OF THE UPPER LIMB")
    format_run(r_sub, font_name="Calibri", size_pt=13, bold=True, color_rgb=RGBColor(0x2B, 0x6C, 0xB0))
    
    p_fmt = doc.add_paragraph()
    p_fmt.paragraph_format.space_before = Pt(0)
    p_fmt.paragraph_format.space_after = Pt(16)
    p_fmt.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
    r_fmt = p_fmt.add_run("Standard International Medical & Anatomy Quiz Competition Format • Practice Edition")
    format_run(r_fmt, font_name="Calibri", size_pt=10, italic=True, color_rgb=RGBColor(0x71, 0x80, 0x96))
    
    # Divider
    p_div = doc.add_paragraph()
    p_div.paragraph_format.space_after = Pt(14)
    pBrd = parse_xml(f'<w:pBrd {nsdecls("w")}><w:bottom w:val="single" w:sz="12" w:space="1" w:color="1A365D"/></w:pBrd>')
    p_div._p.get_or_add_pPr().append(pBrd)
    
    # Group questions by section
    sections_order = []
    sections_dict = {}
    for q in questions:
        sec = q.get("section", "General")
        if sec not in sections_dict:
            sections_dict[sec] = []
            sections_order.append(sec)
        sections_dict[sec].append(q)
        
    for sec_name in sections_order:
        sec_qs = sections_dict[sec_name]
        
        # Section Header
        p_sec = doc.add_paragraph()
        p_sec.paragraph_format.space_before = Pt(16)
        p_sec.paragraph_format.space_after = Pt(8)
        p_sec.paragraph_format.keep_with_next = True
        
        sec_border = parse_xml(f'<w:pBrd {nsdecls("w")}><w:bottom w:val="single" w:sz="6" w:space="2" w:color="2B6CB0"/></w:pBrd>')
        p_sec._p.get_or_add_pPr().append(sec_border)
        
        r_sec = p_sec.add_run(sec_name.upper())
        format_run(r_sec, font_name="Calibri", size_pt=13, bold=True, color_rgb=RGBColor(0x1A, 0x36, 0x5D))
        
        r_count = p_sec.add_run(f"   ({len(sec_qs)} Questions)")
        format_run(r_count, font_name="Calibri", size_pt=10, italic=True, color_rgb=RGBColor(0x71, 0x80, 0x96))
        
        # Questions in section
        for q in sec_qs:
            q_num = q["number"]
            q_p = doc.add_paragraph()
            q_p.paragraph_format.left_indent = Inches(0.32)
            q_p.paragraph_format.first_line_indent = Inches(-0.32)
            q_p.paragraph_format.space_before = Pt(7)
            q_p.paragraph_format.space_after = Pt(3)
            q_p.paragraph_format.line_spacing = 1.15
            
            r_num = q_p.add_run(f"{q_num}.  ")
            format_run(r_num, font_name="Calibri", size_pt=10.5, bold=True, color_rgb=RGBColor(0x1A, 0x20, 0x2C))
            
            r_text = q_p.add_run(q["text"])
            format_run(r_text, font_name="Calibri", size_pt=10.5, color_rgb=RGBColor(0x2D, 0x37, 0x48))
            
            # Options
            for opt_idx, opt_text in enumerate(q["options"]):
                opt_letter = OPTIONS_LETTERS[opt_idx]
                opt_p = doc.add_paragraph()
                opt_p.paragraph_format.left_indent = Inches(0.58)
                opt_p.paragraph_format.first_line_indent = Inches(-0.26)
                opt_p.paragraph_format.space_before = Pt(0)
                opt_p.paragraph_format.space_after = Pt(2)
                opt_p.paragraph_format.line_spacing = 1.15
                
                r_lbl = opt_p.add_run(f"{opt_letter}. ")
                format_run(r_lbl, font_name="Calibri", size_pt=10, bold=True, color_rgb=RGBColor(0x2B, 0x6C, 0xB0))
                
                r_opt = opt_p.add_run(opt_text)
                format_run(r_opt, font_name="Calibri", size_pt=10, color_rgb=RGBColor(0x2D, 0x37, 0x48))
                
    # Page Break for Answer Key & Explanations
    doc.add_page_break()
    
    # Answer Key Section
    p_ak_title = doc.add_paragraph()
    p_ak_title.paragraph_format.space_before = Pt(12)
    p_ak_title.paragraph_format.space_after = Pt(8)
    p_ak_title.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
    r_ak_t = p_ak_title.add_run("OFFICIAL ANSWER KEY")
    format_run(r_ak_t, font_name="Calibri", size_pt=16, bold=True, color_rgb=RGBColor(0x1A, 0x36, 0x5D))
    
    # Table (10 columns: 5 pairs of Q# / Ans)
    NUM_PAIRS = 5
    N = len(questions)
    num_data_rows = (N + NUM_PAIRS - 1) // NUM_PAIRS
    table = doc.add_table(rows=num_data_rows + 1, cols=NUM_PAIRS * 2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table, color="CBD5E0")
    col_widths = [Inches(0.45), Inches(0.85)] * NUM_PAIRS
    
    # Header
    hdr = table.rows[0]
    for c_idx in range(NUM_PAIRS * 2):
        cell = hdr.cells[c_idx]
        cell.width = col_widths[c_idx]
        set_cell_shading(cell, "1A365D")
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
        label = "Q#" if c_idx % 2 == 0 else "Ans"
        r = p.add_run(label)
        format_run(r, font_name="Calibri", size_pt=9.5, bold=True, color_rgb=RGBColor(0xFF, 0xFF, 0xFF))
        
    for q_idx, q in enumerate(questions):
        r_idx = (q_idx // NUM_PAIRS) + 1
        pair_idx = q_idx % NUM_PAIRS
        c_q = pair_idx * 2
        c_ans = pair_idx * 2 + 1
        
        cell_q = table.cell(r_idx, c_q)
        cell_q.width = col_widths[c_q]
        cell_q.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p_q = cell_q.paragraphs[0]
        p_q.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
        p_q.paragraph_format.space_before = Pt(1.5)
        p_q.paragraph_format.space_after = Pt(1.5)
        rq = p_q.add_run(str(q["number"]))
        format_run(rq, font_name="Calibri", size_pt=9.5, color_rgb=RGBColor(0x4A, 0x55, 0x68))
        
        cell_ans = table.cell(r_idx, c_ans)
        cell_ans.width = col_widths[c_ans]
        cell_ans.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p_ans = cell_ans.paragraphs[0]
        p_ans.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
        p_ans.paragraph_format.space_before = Pt(1.5)
        p_ans.paragraph_format.space_after = Pt(1.5)
        ra = p_ans.add_run(q["correctAnswer"])
        format_run(ra, font_name="Calibri", size_pt=10, bold=True, color_rgb=RGBColor(0x1A, 0x36, 0x5D))
        
        if r_idx % 2 == 0:
            set_cell_shading(cell_q, "F7FAFC")
            set_cell_shading(cell_ans, "F7FAFC")
            
    # Page Break for Explanations
    doc.add_page_break()
    
    p_expl_title = doc.add_paragraph()
    p_expl_title.paragraph_format.space_before = Pt(12)
    p_expl_title.paragraph_format.space_after = Pt(8)
    p_expl_title.alignment = WD_PARAGRAPH_ALIGNMENT.CENTER
    r_et = p_expl_title.add_run("DETAILED ANATOMICAL EXPLANATIONS & RATIONALES")
    format_run(r_et, font_name="Calibri", size_pt=16, bold=True, color_rgb=RGBColor(0x1A, 0x36, 0x5D))
    
    for q in questions:
        ep = doc.add_paragraph()
        ep.paragraph_format.space_before = Pt(6)
        ep.paragraph_format.space_after = Pt(2)
        ep.paragraph_format.line_spacing = 1.15
        
        r_enum = ep.add_run(f"Question {q['number']}: ")
        format_run(r_enum, font_name="Calibri", size_pt=10.5, bold=True, color_rgb=RGBColor(0x1A, 0x36, 0x5D))
        
        r_eans = ep.add_run(f"Option {q['correctAnswer']} — {q['options'][q['correct']]}\n")
        format_run(r_eans, font_name="Calibri", size_pt=10, bold=True, color_rgb=RGBColor(0x2B, 0x6C, 0xB0))
        
        r_exp = ep.add_run(q['explanation'])
        format_run(r_exp, font_name="Calibri", size_pt=10, italic=False, color_rgb=RGBColor(0x4A, 0x55, 0x68))

    doc.save(output_file)
    print(f"Saved: {output_file} ({os.path.getsize(output_file) / 1024:.1f} KB)")

if __name__ == "__main__":
    build_docx()
