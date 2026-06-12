# 접속 사이트
```
http://127.0.0.1:5000/
```

# 구현된 기능

| 파일 | 내용 |
| :-----: | :-----: |
| models.py | Transaction 테이블: id, 날짜, 유형, 카테고리, 항목, 금액 |
| app.py GET / | DB에서 전체 내역 조회 + 수입/지출/잔액 합계 계산 |
| app.py POST /add | 폼 데이터 받아서 DB에 저장 |
| index.html | 내역 추가 폼 + 전체 목록 출력 + 요약(수입/지출/잔액) |

# 진행상황
추가해야할 기능
- [x] 삭제 (/delete)
- [x] 수정 (/edit)
- [x] 월별 필터링
- [x] 카테고리별 통계
- [x] 예산 설정
- [ ] 앱으로 만들기
---

```
Expense_tracker/
├─ app.py               ← Flask 서버 (라우트 정의)
├─ models.py            ← DB 테이블 정의
├─ README.md
│      
├─ instance
│     └── expense.db    ← DB
│      
├─ templates
      └── edit.html     ← 수정화면
      └── index.html    ← 기본화면
```

# branch 합병
```
git add .
git commit -m ["change 명"]
git checkout main
git merge [branch 명]
git push
```