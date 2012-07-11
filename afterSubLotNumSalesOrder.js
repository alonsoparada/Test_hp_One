/**
 * Copyright (c) 2009 Trajectory Inc. / Kuspide Canada Inc.
 * 207 Adelaide St. East Suite 302, Toronto, ON, Canada, M5A 1M8
 * www.trajectoryinc.com
 * All Rights Reserved.
 */

/**
 * @System: PRN
 * @Author: Hector Parada	
 * @Company: Trajectory Inc. / Kuspide Canada Inc.
 * @CreationDate: 28/September/2010
 * @GeneralDescription: After Submit Script on Sales Orders Creation that will fill up the Serial/Lot Numbers information.
 * @LastModificationDate: 
 * @LastModificationAuthor:  
 */


 /*
 * @Function: afterSubmitLotNumber
 * @Purpose: Script on Sales Orders Creation that will fill up the Serial/Lot Numbers information.
 * @Parameters:  N/A
 * @Returns: N/A
 */
function afterSubmitLotNumber(type){
	
	nlapiLogExecution('AUDIT','Running afterSubmitLotNumber');
	if ((type == 'create') || (type == 'edit')) {
		var s_recordType = nlapiGetRecordType();
		var s_recordId = nlapiGetRecordId();
		var o_transaction = nlapiLoadRecord(s_recordType, s_recordId);
		var s_location = o_transaction.getFieldValue('location');
		var a_items = new Array();
		var a_itemsSearch = new Array();
		var a_ids = new Array();
		var a_respItemSearch = new Array();
		var i_qty = 0; 
		
		//Get the item and line, when the type of the item is Assembly -- Lot Numbered Assembly -Bill of Materials
		for (var i = 1; i <= o_transaction.getLineItemCount('item'); i++) {
			
			var s_typeSO = o_transaction.getLineItemValue('item', 'itemtype', i);
			var s_lotNumberField = o_transaction.getLineItemValue('item', 'serialnumbers', i);
			if(s_typeSO == 'Assembly' && isNull(s_lotNumberField) ){
				
				var s_itemId = o_transaction.getLineItemValue('item', 'item', i);
				var i_quantity = o_transaction.getLineItemValue('item', 'quantity', i);
				
				if(isNull(a_items[s_itemId])){
					a_items[s_itemId] = new Array();
					a_items[s_itemId].push({'line': i, 'Qty': i_quantity});
				}
				else{
					a_items[s_itemId].push({'line': i, 'Qty': i_quantity});
				}
					
				a_itemsSearch.push(s_itemId);
			}
		}	
		
		if(a_itemsSearch.length > 0){
			
			var ar_filters = new Array();
			var ar_columns = new Array();
			ar_filters.push(new nlobjSearchFilter('internalid', null, 'anyof', a_itemsSearch));
			ar_filters.push(new nlobjSearchFilter('location','inventoryNumber','anyof',s_location));
			ar_filters.push(new nlobjSearchFilter('expiration','inventoryNumber','isnotempty'));
			
			/*ar_columns.push(new nlobjSearchColumn('serialnumber'));
			ar_columns.push(new nlobjSearchColumn('quantityonhand'));
			ar_columns.push(new nlobjSearchColumn('quantityavailable'));*/
			
			ar_columns.push(new nlobjSearchColumn('number', 'inventoryNumber'));
			ar_columns.push(new nlobjSearchColumn('expiration', 'inventoryNumber'));
			ar_columns.push(new nlobjSearchColumn('quantityonhand', 'inventoryNumber'));
			ar_columns.push(new nlobjSearchColumn('quantityavailable', 'inventoryNumber'));
			ar_columns[1].setSort(false);

			var o_searchItems = nlapiSearchRecord('item', null, ar_filters, ar_columns);
			
			if(isNotNull(o_searchItems)){
				
				for(var j = 0;  j < o_searchItems.length; j++){
					
					var s_itemId = o_searchItems[j].getId();
					
					if(isNull(a_respItemSearch[s_itemId])){
						
						a_respItemSearch[s_itemId] =  new Array(); 
						//'serialnumber': This is the serial Lot Number,'quantityonhand': Quantity On Hand of this Lot Number,'quantityavailable': Quantity Available of this Lot Number, 'qtyUsed': Means the quantity used in other items on this Order, 'available': If the quantity on hand is great thand the used is avaiable the lot number
						a_respItemSearch[s_itemId].push({'serialnumber': o_searchItems[j].getValue('number','inventoryNumber'),'quantityonhand':o_searchItems[j].getValue('quantityavailable','inventoryNumber'), 'qtyUsed':0, 'available': 'T' });
						a_ids.push(s_itemId);
					}
					else{
						a_respItemSearch[s_itemId].push({'serialnumber': o_searchItems[j].getValue('number','inventoryNumber'),'quantityonhand':o_searchItems[j].getValue('quantityavailable','inventoryNumber'), 'qtyUsed':0 ,'available': 'T'});
					}
				}
				
				if(a_ids.length > 0){
									
					for(var z = 0; z < a_ids.length ; z++){
						
						for(var i= 0 ; i < a_items[a_ids[z]].length ; i++){
							
							var i_line = a_items[a_ids[z]][i]['line'];
							var s_lotNumbers ='';
							i_qty = a_items[a_ids[z]][i]['Qty'];
							
							for (var j = 0; j < a_respItemSearch[a_ids[z]].length; j++) {
							
								var i_qtyHand = parseFloat(a_respItemSearch[a_ids[z]][j]['quantityonhand']);
								
								if (i_qtyHand > 0) {
								
									
										i_qtyHand = parseFloat(a_respItemSearch[a_ids[z]][j]['quantityonhand']);
										
										var s_serialNum = a_respItemSearch[a_ids[z]][j]['serialnumber'];
										
										if (parseFloat(i_qtyHand) > parseFloat(i_qty)) {
										
											a_respItemSearch[a_ids[z]][j]['quantityonhand'] = i_qtyHand - i_qty;
											if (s_lotNumbers.length > 0) {
												s_lotNumbers = s_lotNumbers + ',';
											}
											s_lotNumbers = s_lotNumbers + s_serialNum + '(' + i_qty + ')';
											i_qty = 0;
											
										}
										else {
										
											i_qty = i_qty - i_qtyHand;
											a_respItemSearch[a_ids[z]][j]['quantityonhand'] = 0;
											
											if (s_lotNumbers.length > 0) {
												s_lotNumbers = s_lotNumbers + ',';
											}
											s_lotNumbers = s_lotNumbers + s_serialNum + '(' + i_qtyHand + ')';
											
										}
										
										if (i_qty == 0) {
											break;
										}
									}
								}
									
								if (i_qty == 0)
									o_transaction.setLineItemValue('item', 'serialnumbers', i_line ,s_lotNumbers);							 
							}							
						}
						nlapiSubmitRecord(o_transaction, true, true);

				}				
			}
		}						
	}		
		
	nlapiLogExecution('AUDIT','Completed afterSubmitLotNumber');
}

/***

var s_recordType = 'salesorder';
		var s_recordId = '127385';

var jas = 0;
lotnumberedassemblyitem


var s_recordType = 'salesorder';
		var s_recordId = '127385';
		var o_transaction = nlapiLoadRecord(s_recordType, s_recordId);

**/


/*
var filters = new Array();
filters.push(new nlobjSearchFilter('internalidnumber',null,'equalto','538'));			
var o_SearchResults = nlapiSearchRecord('item', '679', filters , true


var a_columns = new Array();
var a_filters = new Array();
a_columns.push(new nlobjSearchColumn('number', 'inventoryNumber'));
a_columns.push(new nlobjSearchColumn('expiration', 'inventoryNumber'));
a_columns.push(new nlobjSearchColumn('quantityonhand', 'inventoryNumber'));
a_columns[1].setSort(false);
a_filters.push(new nlobjSearchFilter('internalidnumber',null,'equalto','538'));	
a_filters.push(new nlobjSearchFilter('expiration','inventoryNumber','isnotempty'));
					
var o_SearchResults = nlapiSearchRecord('item', null, a_filters , a_columns);

var s_exprDate = o_SearchResults[0].getValue('expiration','inventoryNumber');
var i_lotNumber = o_SearchResults[0].getValue('number','inventoryNumber');
var s_itemId = o_SearchResults[0].getId();
var s_qtyHand = o_SearchResults[0].getValue('quantityonhand','inventoryNumber');

*/

