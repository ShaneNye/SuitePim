CASE
    WHEN {transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.trandate} >= TO_DATE('01/08/2025', 'DD/MM/YYYY') THEN
        CASE 
            WHEN {entity#display} IN ('I/C - Bexhill', 'I/C - Canterbury', 'I/C - Portslade', 'I/C - Hailsham') THEN 
                (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 3
            ELSE 
                (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 1
        END

    WHEN {transactionlines.item^item.custitem_sb_category#display} IN (
        'Motion Therapy Mattress', 
        'Motion Therapy (upholstered) Headboards', 
        'Motion Therapy Bases Only'
    )
    AND {transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.trandate} > TO_DATE('02/06/2025', 'DD/MM/YYYY') THEN
        (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 7

    WHEN {transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.trandate} < TO_DATE('01/05/2025', 'DD/MM/YYYY') THEN
        CASE 
            WHEN {transactionlines.item^item.custitem_sb_supplier_ltd#display} = 'Harrison Spinks Beds Ltd' THEN
                (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 7
            ELSE
                CASE 
                    WHEN {entity#display} IN ('I/C - Bexhill', 'I/C - Canterbury', 'I/C - Portslade', 'I/C - Hailsham') THEN 
                        (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 4
                    ELSE 
                        (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 3
                END
        END

    ELSE
        CASE 
            WHEN {transactionlines.item^item.custitem_sb_supplier_ltd#display} = 'Harrison Spinks Beds Ltd' THEN
                (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 7
            ELSE
                CASE 
                    WHEN {entity#display} IN ('I/C - Bexhill', 'I/C - Canterbury', 'I/C - Portslade', 'I/C - Hailsham') THEN 
                        (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 4
                    ELSE 
                        (ABS(TO_NUMBER({transactionlines.createdfrom^transaction.custbody_sb_pairedsalesorder^transaction.transactionlines.foreignamount}))) / 100 * 120 / 100 * 4
                END
        END
END