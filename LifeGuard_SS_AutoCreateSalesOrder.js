 /** 
  * Copyright (c) 1998-2009 NetSuite, Inc. 
  * 2955 Campus Drive, Suite 100, San Mateo, CA, USA 94403-2511 
  * All Rights Reserved. 
  * 
  * This software is the confidential and proprietary information of 
  * NetSuite, Inc. ("Confidential Information"). You shall not 
  * disclose such Confidential Information and shall use it only in 
  * accordance with the terms of the license agreement you entered into 
  * with NetSuite. 
  */ 
   
 /**  
  * The purpose of this script is that the script will
  * then search for "Auto-Ship Subscriptions" custom record that are due to be processed on
  * that day. The script will then create new sales order for the "Auto-ship" subscriptions.
  * 
  * @author Fernce C. Borcena 
  * @version 1.0 
  */ 
function main() 
{ 
    var logger = new Logger(); 
    logger.enableDebug(); 
    logger.debug('Entry Log', 'Entered Script Execution.'); 
	logger.debug('New date', 'new date' + new Date());
    
	
    try 
    {
		var filters = [ 
			new nlobjSearchFilter('isinactive', null, 'is','F'),
			new nlobjSearchFilter('custrecord_next_order_date', null, 'on', nlapiDateToString(new Date()))
		]; 
       
	    var searchResults = nlapiSearchRecord('customrecord_auto_ship_subscriptions', null, filters);    
		logger.debug('Entry Search Result', 'Entry Search Result'); 
		if(!isArrayEmpty(searchResults))
		{
			 logger.debug('Entry within Search Result', 'Entry within Search Result'); 
			for (var i = 0; i < searchResults.length; i++) 
			{
				 logger.debug('Inside for loop', 'Inside for loop'); 
				var recAutoShip = nlapiLoadRecord('customrecord_auto_ship_subscriptions', searchResults[i].getId());
				var stCustomer = recAutoShip.getFieldValue('custrecord_customer');
				var stSaleOrderNumber = recAutoShip.getFieldValue('custrecord_original_order');
				var stShipMethod = recAutoShip.getFieldValue('custrecord_ship_method');
				var stItemName = recAutoShip.getFieldValue('custrecord_item_name');
				var stItemQty = recAutoShip.getFieldValue('custrecord_quantity');
				var stItemFrequency = recAutoShip.getFieldValue('custrecord_frequency');
				var stItemRate = recAutoShip.getFieldValue('custrecord_rate');
				var stItemPromoCode = recAutoShip.getFieldValue('custrecord_promotion_code');
				//stItemFrequency =
				var intDays = 0;
				switch(forceParseInt(stItemFrequency))
				{
					case 1:
						intDays = 1;
						break;
					case 2:
						intDays = 30;
						break;
					case 3:
						intDays = 90;
						break;
					case 4:
						intDays = 365;
						break;
					case 5:
						intDays = 60;
						break;
				}
				
				logger.debug('intDays', 'intDays:'+ intDays); 
				var dateObj = nlapiAddDays(new Date(), intDays);
				recAutoShip.setFieldValue('custrecord_next_order_date',nlapiDateToString(dateObj, 'date'));
								
				// create sale order
				var recSalesOrder = nlapiCreateRecord('salesorder');
				recSalesOrder.setFieldValue('entity', stCustomer);
				recSalesOrder.setFieldValue('promocode', stItemPromoCode);
				//recSalesOrder.setFieldValue('shipmethod', 200);
				recSalesOrder.setFieldValue('shipmethod', stShipMethod);
				// new line item
				recSalesOrder.setLineItemValue('item', 'item', 1, stItemName);
				recSalesOrder.setLineItemValue('item', 'quantity', 1, stItemQty);
				recSalesOrder.setLineItemValue('item', 'pricelevels', 1, -1);
				recSalesOrder.setLineItemValue('item', 'rate', 1, stItemRate);
				recSalesOrder.setLineItemValue('item', 'custcol_recurring', 1, 'F');
				logger.debug('Subscription', 'Subscription:' +  recAutoShip.getId()); 
				recSalesOrder.setLineItemValue('item', 'custcol_subscription', 1, recAutoShip.getId());
				
				
				//submit Sales Order
				logger.debug('before saving SO', 'before saving SO'); 
				try
				{
					var stSalesOrderNumber = nlapiSubmitRecord(recSalesOrder, true, true);
					logger.debug('Sales Order Save', 'Sales Order Save' + stSalesOrderNumber);
					//update Auto Ship - MD - this is done above already
					//var dateObj = nlapiAddDays(new Date(), forceParseInt(stItemFrequency));
					//recAutoShip.setFieldValue('custrecord_next_order_date',nlapiDateToString(dateObj, 'date'));
					logger.debug('Submit Auto Ship', 'Submit Auto Ship:' + nlapiSubmitRecord(recAutoShip, true));	
				}
				catch (err)
				{
					if (err.getDetails != undefined) 
					{ 
						logger.error('Process Error',  'Auto-ship internal ID: ' + recAutoShip.getId() + '|' + err.getCode() + ': ' + err.getDetails()); 
					} 
					else 
					{ 
						logger.error('Unexpected Error', 'Auto-ship internal ID: ' + recAutoShip.getId() + '|' + err.toString());  
					} 
				}
			}
		}
    }  
    catch (error) 
    { 
        if (error.getDetails != undefined) 
        { 
            logger.error('Process Error',  error.getCode() + ': ' + error.getDetails()); 
            throw error; 
        } 
        else 
        { 
            logger.error('Unexpected Error', error.toString());  
            throw nlapiCreateError('99999', error.toString()); 
        } 
    } 
    
    logger.debug('Exit Log', 'Exit Script Execution.'); 
} 
    
