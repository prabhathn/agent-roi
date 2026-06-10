-- Agent ROI Demo: Semantic View for Cortex Analyst
-- Defines entities, relationships, dimensions, metrics, and verified queries

USE DATABASE AGENT_ROI_DEMO;
USE SCHEMA APP;

CREATE OR REPLACE SEMANTIC VIEW AGENT_ROI_DEMO.APP.SALES_SEMANTIC_VIEW

  TABLES (
    orders AS AGENT_ROI_DEMO.APP.ORDERS
      PRIMARY KEY (order_id)
      COMMENT = 'Sales orders with pricing and priority',
    customers AS AGENT_ROI_DEMO.APP.CUSTOMERS
      PRIMARY KEY (customer_id)
      COMMENT = 'Customer accounts with market segment and balance',
    nations AS AGENT_ROI_DEMO.APP.NATIONS
      PRIMARY KEY (nation_key)
      COMMENT = 'Country reference data',
    regions AS AGENT_ROI_DEMO.APP.REGIONS
      PRIMARY KEY (region_key)
      COMMENT = 'Geographic region reference'
  )

  RELATIONSHIPS (
    orders_to_customers AS
      orders (customer_id) REFERENCES customers,
    customers_to_nations AS
      customers (nation_key) REFERENCES nations,
    nations_to_regions AS
      nations (region_key) REFERENCES regions
  )

  FACTS (
    orders.order_id_fact AS order_id,
    customers.customer_id_fact AS customer_id
  )

  DIMENSIONS (
    orders.order_date AS order_date
      COMMENT = 'Date the order was placed',
    orders.order_year AS YEAR(order_date)
      COMMENT = 'Year when the order was placed',
    orders.order_month AS DATE_TRUNC('month', order_date)
      COMMENT = 'Month when the order was placed',
    orders.status AS status
      COMMENT = 'Order status: O=Open, P=Partial, F=Fulfilled',
    orders.priority AS priority
      COMMENT = 'Order priority: 1-URGENT, 2-HIGH, 3-MEDIUM, 4-NOT SPECIFIED, 5-LOW',
    customers.market_segment AS market_segment
      COMMENT = 'Customer market segment: BUILDING, AUTOMOBILE, MACHINERY, HOUSEHOLD, FURNITURE',
    customers.account_balance_dim AS account_balance
      COMMENT = 'Customer account balance',
    nations.nation_name AS nation_name
      COMMENT = 'Country name',
    regions.region_name AS region_name
      COMMENT = 'Geographic region: AFRICA, AMERICA, ASIA, EUROPE, MIDDLE EAST'
  )

  METRICS (
    orders.total_revenue AS SUM(total_price)
      COMMENT = 'Total revenue from orders (sum of total_price)',
    orders.order_count AS COUNT(order_id)
      COMMENT = 'Number of orders',
    orders.avg_order_value AS AVG(total_price)
      COMMENT = 'Average order value',
    orders.customer_count AS COUNT(DISTINCT orders.customer_id)
      COMMENT = 'Number of unique customers who placed orders'
  )

  COMMENT = 'Semantic view over TPC-H derived sales data for the Agent ROI Demo'

  AI_VERIFIED_QUERIES (
    revenue_by_region AS (
      QUESTION 'What is the total revenue by region?'
      VERIFIED_AT 1748500000
      ONBOARDING_QUESTION TRUE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT r.region_name, SUM(o.total_price) AS total_revenue FROM AGENT_ROI_DEMO.APP.ORDERS o JOIN AGENT_ROI_DEMO.APP.CUSTOMERS c ON o.customer_id = c.customer_id JOIN AGENT_ROI_DEMO.APP.NATIONS n ON c.nation_key = n.nation_key JOIN AGENT_ROI_DEMO.APP.REGIONS r ON n.region_key = r.region_key GROUP BY r.region_name ORDER BY total_revenue DESC'
    ),
    orders_in_1995 AS (
      QUESTION 'How many orders were placed in 1995?'
      VERIFIED_AT 1748500000
      ONBOARDING_QUESTION TRUE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT COUNT(*) AS order_count FROM AGENT_ROI_DEMO.APP.ORDERS WHERE YEAR(order_date) = 1995'
    ),
    avg_value_automobile AS (
      QUESTION 'What is the average order value for the AUTOMOBILE segment?'
      VERIFIED_AT 1748500000
      ONBOARDING_QUESTION TRUE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT AVG(o.total_price) AS avg_order_value FROM AGENT_ROI_DEMO.APP.ORDERS o JOIN AGENT_ROI_DEMO.APP.CUSTOMERS c ON o.customer_id = c.customer_id WHERE c.market_segment = ''AUTOMOBILE'''
    ),
    urgent_orders_by_nation AS (
      QUESTION 'Which nations have the most urgent orders?'
      VERIFIED_AT 1748500000
      ONBOARDING_QUESTION FALSE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT n.nation_name, COUNT(*) AS urgent_orders FROM AGENT_ROI_DEMO.APP.ORDERS o JOIN AGENT_ROI_DEMO.APP.CUSTOMERS c ON o.customer_id = c.customer_id JOIN AGENT_ROI_DEMO.APP.NATIONS n ON c.nation_key = n.nation_key WHERE o.priority = ''1-URGENT'' GROUP BY n.nation_name ORDER BY urgent_orders DESC LIMIT 10'
    ),
    monthly_revenue_trend AS (
      QUESTION 'Show monthly revenue trend'
      VERIFIED_AT 1748500000
      ONBOARDING_QUESTION TRUE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT DATE_TRUNC(''month'', order_date) AS month, SUM(total_price) AS monthly_revenue FROM AGENT_ROI_DEMO.APP.ORDERS GROUP BY month ORDER BY month'
    ),
    revenue_by_segment AS (
      QUESTION 'Which market segments generate the most revenue?'
      VERIFIED_AT 1748500000
      ONBOARDING_QUESTION FALSE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT c.market_segment, SUM(o.total_price) AS total_revenue, COUNT(*) AS order_count FROM AGENT_ROI_DEMO.APP.ORDERS o JOIN AGENT_ROI_DEMO.APP.CUSTOMERS c ON o.customer_id = c.customer_id GROUP BY c.market_segment ORDER BY total_revenue DESC'
    ),
    revenue_by_status AS (
      QUESTION 'What is the revenue breakdown by order status?'
      VERIFIED_AT 1748500000
      ONBOARDING_QUESTION FALSE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT status, SUM(total_price) AS total_revenue, COUNT(*) AS order_count FROM AGENT_ROI_DEMO.APP.ORDERS GROUP BY status ORDER BY total_revenue DESC'
    ),
    avg_balance_by_region AS (
      QUESTION 'What is the average account balance by region?'
      VERIFIED_AT 1748500000
      ONBOARDING_QUESTION FALSE
      VERIFIED_BY '(STEWARD = admin)'
      SQL 'SELECT r.region_name, AVG(c.account_balance) AS avg_balance FROM AGENT_ROI_DEMO.APP.CUSTOMERS c JOIN AGENT_ROI_DEMO.APP.NATIONS n ON c.nation_key = n.nation_key JOIN AGENT_ROI_DEMO.APP.REGIONS r ON n.region_key = r.region_key GROUP BY r.region_name ORDER BY avg_balance DESC'
    )
  );
