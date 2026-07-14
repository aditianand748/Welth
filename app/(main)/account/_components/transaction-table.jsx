"use client";

import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns';
import React from 'react'

const TransactionTable = ({ transactions }) => {
    const filteredAndSortedTransactions = transactions;

    const handleSort = () => { };

    return (
        <div className='space-y-4'>
            {/*Filters */}

            {/*transactions */}
            <div className='rounded-md border'>
                <Table>

                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]">
                                <Checkbox />
                            </TableHead>
                            <TableHead className="cursor-pointer" onClick={() => handleSort("date")} >
                                <div className='flex items-center'>Date</div>
                            </TableHead>
                            <TableHead>
                                Description
                            </TableHead>
                            <TableHead className="cursor-pointer" onClick={() => handleSort("category")} >
                                <div className='flex items-center'>Category</div>
                            </TableHead>
                            <TableHead className="cursor-pointer" onClick={() => handleSort("amount")} >
                                <div className='flex items-center justify-end'>Amount</div>
                            </TableHead>
                            <TableHead>Recurring</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAndSortedTransactions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                    No Transactions Found
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredAndSortedTransactions.map((transaction) => (
                                <TableRow key={transaction.id}>
                                    <TableCell>
                                        <Checkbox />
                                    </TableCell>
                                    <TableCell>{format(new Date(transaction.date), "pp")}</TableCell>
                                    <TableCell>{transaction.description}</TableCell>
                                    <TableCell>{transaction}</TableCell>
                                    <TableCell className="text-right">$250.00</TableCell>
                                </TableRow>
                            ))
                        )}

                    </TableBody>
                </Table>
            </div>
        </div>
    );

}

export default TransactionTable