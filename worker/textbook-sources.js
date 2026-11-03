// Source identities only. No local paths, book text or PDF bytes.
export const textbookSourceVersion='textbook-catalog-20261103';
export const textbookSources=[
  {
    "id": "chen_advanced_2",
    "title": "高级计量经济学及Stata应用",
    "authors": "陈强",
    "edition": "2014年第二版",
    "software_note": "书中Stata12；当前操作以Stata18帮助为准",
    "kind": "textbook",
    "status": "selected_pages_reviewed",
    "reviewed_pdf_pages": [
      28,
      35,
      265
    ],
    "files": [
      {
        "id": "chen_advanced_2-variant-1",
        "sha256": "3f6ef6826a97a4e8f28695afa9ee619617ef4c8328371004b3d3aa816ea8cba4",
        "pages": 694,
        "bytes": 136633292
      },
      {
        "id": "chen_advanced_2-variant-2",
        "sha256": "982df59ea64a3c410238226947f71f4b1587b4d87fd90789af793b766ace859d",
        "pages": 694,
        "bytes": 136363733
      }
    ],
    "distribution": "bibliography_and_original_cards_only",
    "review_status": "所列正文页已核对；自编教学表述仍待教师审阅"
  },
  {
    "id": "chen_basic_1",
    "title": "计量经济学及Stata应用",
    "authors": "陈强",
    "edition": "2015年第一版",
    "software_note": "当前操作以Stata18帮助为准",
    "kind": "textbook",
    "status": "selected_pages_reviewed",
    "reviewed_pdf_pages": [
      70,
      202,
      247
    ],
    "files": [
      {
        "id": "chen_basic_1-file",
        "sha256": "f7718428f30aae10c60b844e0ae408836b74bf735bcabeb2550ec53e516952f6",
        "pages": 360,
        "bytes": 64823019
      }
    ],
    "distribution": "bibliography_and_original_cards_only",
    "review_status": "所列正文页已核对；自编教学表述仍待教师审阅"
  },
  {
    "id": "yang_stata_1",
    "title": "Stata统计分析从入门到精通",
    "authors": "杨维忠、张甜",
    "edition": "2022年第一版",
    "software_note": "书中Stata16；当前操作以Stata18帮助为准",
    "kind": "textbook",
    "status": "selected_pages_reviewed",
    "reviewed_pdf_pages": [
      239,
      653,
      654,
      663,
      736
    ],
    "files": [
      {
        "id": "yang_stata_1-file",
        "sha256": "228b2d3038b9ba55919cb2b6638bdfa679541809f2cf91db408a4f549e18c3f5",
        "pages": 765,
        "bytes": 92911858
      }
    ],
    "distribution": "bibliography_and_original_cards_only",
    "review_status": "所列正文页已核对；自编教学表述仍待教师审阅"
  },
  {
    "id": "qiu_causal",
    "title": "因果推断实用计量方法",
    "authors": "邱嘉平",
    "edition": "版次未核实",
    "software_note": "用于DID直觉，不替代同批多时期模型规范",
    "kind": "textbook",
    "status": "selected_pages_reviewed",
    "reviewed_pdf_pages": [
      242
    ],
    "files": [
      {
        "id": "qiu_causal-file",
        "sha256": "cbfa0a21cb4c6b3236b29d7eedf5a7b0d722f6470479442bb7d6b5d0a5a4c264",
        "pages": 343,
        "bytes": 43959479
      }
    ],
    "distribution": "bibliography_and_original_cards_only",
    "review_status": "所列正文页已核对；自编教学表述仍待教师审阅"
  },
  {
    "id": "wang_stata_1",
    "title": "STATA实用教程",
    "authors": "王天夫、李博柏",
    "edition": "2008年第一版",
    "software_note": "书中Stata10；旧导入命令不作为当前默认语法",
    "kind": "textbook",
    "status": "selected_pages_reviewed",
    "reviewed_pdf_pages": [
      34,
      90,
      115,
      183
    ],
    "files": [
      {
        "id": "wang_stata_1-file",
        "sha256": "1be98d41283c0cab5c72377c677cb7edb47d1c293dc9b3cb2371530cde5db6cb",
        "pages": 466,
        "bytes": 93294107
      }
    ],
    "distribution": "bibliography_and_original_cards_only",
    "review_status": "所列正文页已核对；自编教学表述仍待教师审阅"
  },
  {
    "id": "chen_basic_errata",
    "title": "教材勘误表—计量经济学及Stata应用",
    "authors": "陈强",
    "edition": "2017-03-08",
    "software_note": "只对匹配版本核对；不套用到高级计量教材",
    "kind": "errata",
    "status": "selected_pages_reviewed",
    "reviewed_pdf_pages": [
      1
    ],
    "files": [
      {
        "id": "chen_basic_errata-file",
        "sha256": "fe3537461040f80943cc075a1755fcc2d6db57196246b9aebe9577e8985a7145",
        "pages": 2,
        "bytes": 191310
      }
    ],
    "distribution": "bibliography_and_original_cards_only",
    "review_status": "所列正文页已核对；自编教学表述仍待教师审阅"
  }
];
export function sourceIdForReference(reference){return textbookSources.find(s=>s.title.replace(/[——\s]/g,'')===String(reference.title||'').replace(/[——\s]/g,''))?.id||null;}
export function textbookCatalog(cards){return {version:textbookSourceVersion,file_count:textbookSources.reduce((n,s)=>n+s.files.length,0),textbook_count:textbookSources.filter(s=>s.kind==='textbook').length,sources:textbookSources.map(s=>({...s,card_ids:cards.filter(c=>c.references?.some(r=>r.source_id===s.id)).map(c=>c.id)}))};}
